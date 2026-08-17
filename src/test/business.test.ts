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
  it("has nothing left unconfigured", () => {
    // Every statutory disclosure is now set, so this asserts the finished
    // state rather than a known gap. If someone empties a value, or sets a VAT
    // number while unregistered, this fails and names what broke.
    expect(configurationIssues()).toEqual([]);
  });

  it("carries the registered office address required of a UK company", () => {
    expect(BUSINESS.registeredAddress).toBe("26 Greenlands Road, Camberley, Surrey, GU15 2RT");
  });

  it("does not let a blank environment variable erase a real value", () => {
    // This suite runs with a .env carrying empty entries, which is exactly the
    // shape of the bug: `??` falls back only on null and undefined, so an
    // override that reads "" would win over the default and silently drop a
    // statutory disclosure. Every value below has an empty variable set for it
    // somewhere, so if `env()` stops treating blank as absent, these go empty.
    expect(BUSINESS.registeredAddress).not.toBe("");
    expect(BUSINESS.companyNumber).not.toBe("");
    expect(BUSINESS.email).not.toBe("");
  });

  it("carries a real phone number rather than a placeholder", () => {
    // A UK mobile in E.164: +447 followed by nine digits.
    expect(BUSINESS.phone).toMatch(/^\+447\d{9}$/);
    expect(BUSINESS.phone.replace(/\D/g, "")).not.toMatch(/^447700900\d{3}$/);
  });

  it("shows the same number it dials", () => {
    // The display form is what a customer reads off the page and types into a
    // keypad; the E.164 form is what the tel: link uses. If they ever drift
    // apart, half the people who try to call reach nobody. Normalising the
    // leading zero to the country code is the only comparison that catches it.
    const dialled = BUSINESS.phone.replace(/\D/g, "");
    const displayed = BUSINESS.phoneDisplay.replace(/\D/g, "");
    expect(displayed).toMatch(/^07\d{9}$/);
    expect(`44${displayed.slice(1)}`).toBe(dialled);
  });

  it("sends WhatsApp to the same number as well", () => {
    expect(whatsappConfigured()).toBe(true);
    expect(BUSINESS.whatsapp).toMatch(/^\d{10,15}$/);
    expect(BUSINESS.whatsapp).toBe(BUSINESS.phone.replace(/\D/g, ""));
  });

  it("carries the statutory company disclosures", () => {
    expect(BUSINESS.legalName).toBe("Drive Precise Ltd");
    expect(BUSINESS.companyNumber).toBe("15264715");
    expect(BUSINESS.placeOfRegistration).toBe("England and Wales");
  });

  it("never advertises a VAT number while unregistered", () => {
    // Displaying a VAT number, or charging VAT, while not registered is an
    // offence. This is the guard that stops a stray environment variable or a
    // copy-paste from doing it.
    expect(BUSINESS.vatRegistered).toBe(false);
    expect(BUSINESS.vatNumber).toBe("");
    expect(configurationIssues().join(" ")).not.toContain("VAT number is set");
  });

  it("does not advertise an email address nobody has created", () => {
    // Trade enquiries are the highest-value ones on the site. Pointing them at
    // a `trade@` mailbox that does not exist loses them silently.
    expect(BUSINESS.email).toBe("hello@driveprecise.co.uk");
    expect(BUSINESS.tradeEmail).toBe(BUSINESS.email);
  });

  it("names the person accountable for the work", () => {
    expect(BUSINESS.director.name).toBe("Brandon M Stephen");
    expect(BUSINESS.director.role).toContain("Director");
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
