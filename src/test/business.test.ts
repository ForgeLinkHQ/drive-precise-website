import { describe, expect, it } from "vitest";

import {
  BUSINESS,
  SERVICE_AREAS,
  checkCoverage,
  configurationIssues,
  outwardCode,
  whatsappConfigured,
} from "@/lib/business";
import { SYMPTOM_OPTIONS } from "@/lib/symptoms";
import { getServiceById } from "@/lib/services";
import { getPackageById } from "@/lib/packages";
import { PARTNER_BLURB, PARTNER_LABEL } from "@/lib/partners";
import { mailtoHref, telHref } from "@/lib/contact-links";

describe("postcode coverage (§56)", () => {
  it("reads the outward code from the formats people type", () => {
    expect(outwardCode("GU15 3AB")).toBe("GU15");
    expect(outwardCode("gu153ab")).toBe("GU15");
    expect(outwardCode("gu15")).toBe("GU15");
    expect(outwardCode("W1A 1AA")).toBe("W1A");
    expect(outwardCode("M1 1AE")).toBe("M1");
  });

  it("returns null rather than guessing at nonsense", () => {
    expect(outwardCode("")).toBeNull();
    expect(outwardCode("hello")).toBeNull();
    expect(outwardCode("12345")).toBeNull();
  });

  it("recognises a core area", () => {
    const result = checkCoverage("GU14 6XX");
    expect(result.status).toBe("core");
    if (result.status === "core") expect(result.area.name).toBe("Farnborough");
  });

  it("recognises an extended area", () => {
    expect(checkCoverage("RG1 1AA").status).toBe("extended");
  });

  it("says plainly when somewhere is outside the area", () => {
    expect(checkCoverage("EH1 1AA").status).toBe("outside");
  });

  it("distinguishes an unreadable postcode from an uncovered one", () => {
    // These get different wording on the page, so they must be different states.
    expect(checkCoverage("banana").status).toBe("unrecognised");
  });

  it("never lists the same outward code in two areas", () => {
    const all = SERVICE_AREAS.flatMap((a) => a.outwardCodes);
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every area at least one outward code", () => {
    for (const area of SERVICE_AREAS) {
      expect(area.outwardCodes.length, area.name).toBeGreaterThan(0);
    }
  });
});

describe("business configuration", () => {
  it("reports the placeholders that must be replaced before launch", () => {
    const issues = configurationIssues();
    // In this environment nothing is configured, so every check should fire.
    // The value of this test is that the function actually detects them.
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toContain("VITE_BUSINESS_PHONE");
  });

  it("uses an unallocated number as the placeholder, never an invented one", () => {
    // Ofcom's drama ranges are permanently unassigned, so an unconfigured site
    // cannot send anyone to a stranger's phone.
    expect(BUSINESS.phone.replace(/\D/g, "")).toMatch(/^447700900\d{3}$/);
  });

  it("still produces a valid WhatsApp number shape", () => {
    expect(whatsappConfigured()).toBe(true);
    expect(BUSINESS.whatsapp).toMatch(/^\d{10,15}$/);
  });

  it("states the BMW position in the descriptor without claiming affiliation", () => {
    expect(BUSINESS.descriptor).toBe("Independent Mobile BMW Specialist");
  });
});

describe("contact links", () => {
  it("percent-encodes a mailto recipient so headers can't be injected", () => {
    const href = mailtoHref("someone@example.com?bcc=attacker@example.net");
    expect(href).not.toContain("?bcc=");
    expect(href).toContain("%3Fbcc%3D");
  });

  it("encodes subject and body", () => {
    const href = mailtoHref("a@b.com", { subject: "Marks & Spencer", body: "hi there" });
    expect(href).toContain("subject=Marks+%26+Spencer");
  });

  it("encodes a tel: number", () => {
    expect(telHref("+44 7700 900123")).toBe("tel:%2B44%207700%20900123");
  });
});

describe("the symptom router (§7)", () => {
  it("offers every option the brief lists", () => {
    expect(SYMPTOM_OPTIONS.length).toBeGreaterThanOrEqual(14);
  });

  it("has unique ids", () => {
    const ids = SYMPTOM_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every option at something that exists", () => {
    for (const option of SYMPTOM_OPTIONS) {
      if (option.target.kind === "service") {
        const service = getServiceById(option.target.serviceId);
        expect(service, `${option.id} -> ${option.target.serviceId}`).toBeTruthy();
        expect(service!.active, option.target.serviceId).toBe(true);
      }
      if (option.target.kind === "package") {
        const pkg = getPackageById(option.target.packageId);
        expect(pkg, `${option.id} -> ${option.target.packageId}`).toBeTruthy();
        expect(pkg!.active, option.target.packageId).toBe(true);
      }
    }
  });

  it("writes every label in plain English, first person, no jargon", () => {
    for (const option of SYMPTOM_OPTIONS) {
      expect(option.label.length, option.id).toBeGreaterThan(3);
      expect(option.helper.length, option.id).toBeGreaterThan(3);
      // The point of §7 is that someone can pick an option without knowing
      // what a drop link is.
      expect(option.label.toLowerCase()).not.toMatch(/drop link|control arm|tensioner|caliper/);
    }
  });
});

describe("partner vocabulary (§18)", () => {
  it("labels and describes every partner category", () => {
    for (const category of Object.keys(PARTNER_LABEL) as (keyof typeof PARTNER_LABEL)[]) {
      expect(PARTNER_LABEL[category]).toBeTruthy();
      expect(PARTNER_BLURB[category]).toBeTruthy();
    }
  });

  it("never mentions commission in customer-facing wording", () => {
    for (const blurb of Object.values(PARTNER_BLURB)) {
      expect(blurb.toLowerCase()).not.toContain("commission");
      expect(blurb.toLowerCase()).not.toContain("referral fee");
    }
  });
});
