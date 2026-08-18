import { describe, expect, it } from "vitest";

import { buildWhatsAppMessage, whatsappHref } from "@/lib/whatsapp";
import type { EnquirySnapshot } from "@/lib/enquiry";

const BASE: EnquirySnapshot = {
  reference: "DP-1042",
  createdAt: "2026-08-16T09:00:00.000Z",
  name: "John Smith",
  phone: "07700 900123",
  email: "john@example.com",
  registration: "AB12CDE",
  mileage: 52400,
  vehicleDescription: "Model to confirm",
  vehicleNotes: "",
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
  vehicleFuel: null,
  vehicleEngine: null,
  items: [
    { kind: "service", id: "minor-service", name: "Minor Service", pricing: "from", priceGbp: 149 },
    {
      kind: "service",
      id: "cabin-filter",
      name: "Cabin / Pollen Filter",
      pricing: "from",
      priceGbp: 49,
    },
  ],
  indicativeTotalGbp: 198,
  hasFromPricing: true,
  quoteOnlyCount: 0,
  postcode: "GU15",
  location: "home",
  locationLabel: "At my home",
  preferredDate: "2026-08-21",
  preferredWindow: "morning",
  preferredLabel: "Friday 21 August, morning",
  notes: "",
  referralSource: "google-organic",
  campaign: null,
};

describe("the WhatsApp message (§26)", () => {
  it("carries everything Drive Precise needs to quote", () => {
    const message = buildWhatsAppMessage(BASE);

    expect(message).toContain("AB12 CDE");
    expect(message).toContain("52,400");
    expect(message).toContain("Minor Service");
    expect(message).toContain("Cabin / Pollen Filter");
    expect(message).toContain("GU15");
    expect(message).toContain("Friday 21 August, morning");
    expect(message).toContain("DP-1042");
    expect(message).toContain("Please confirm the final vehicle-specific price");
  });

  it("marks a 'from' item as a from price rather than a firm one", () => {
    const message = buildWhatsAppMessage(BASE);
    expect(message).toContain("Minor Service (from £149)");
    expect(message).toContain("estimated from total: £198");
  });

  it("labels a fixed-price item without the word 'from'", () => {
    const message = buildWhatsAppMessage({
      ...BASE,
      items: [
        {
          kind: "service",
          id: "vehicle-health-check",
          name: "Vehicle Health Check",
          pricing: "fixed",
          priceGbp: 59,
        },
      ],
      indicativeTotalGbp: 59,
      hasFromPricing: false,
    });
    expect(message).toContain("Vehicle Health Check (£59)");
    expect(message).not.toContain("from £59");
  });

  it("says a quote-only item needs quoting rather than showing a price", () => {
    const message = buildWhatsAppMessage({
      ...BASE,
      items: [
        { kind: "service", id: "oil-leak-repair", name: "Oil Leak Repair", pricing: "quote" },
      ],
      indicativeTotalGbp: 0,
      quoteOnlyCount: 1,
      hasFromPricing: false,
    });
    expect(message).toContain("Oil Leak Repair (quote required)");
    expect(message).not.toContain("£0");
  });

  it("counts quote-only items alongside the total", () => {
    const message = buildWhatsAppMessage({ ...BASE, quoteOnlyCount: 2 });
    expect(message).toContain("Plus 2 items to be quoted");
  });

  it("uses the singular for one quote-only item", () => {
    const message = buildWhatsAppMessage({ ...BASE, quoteOnlyCount: 1 });
    expect(message).toContain("Plus 1 item to be quoted");
  });

  it("omits absent fields rather than writing 'unknown'", () => {
    const message = buildWhatsAppMessage({
      ...BASE,
      mileage: null,
      postcode: "",
      preferredLabel: null,
      locationLabel: null,
      reference: null,
    });

    expect(message).not.toMatch(/Mileage:/);
    expect(message).not.toMatch(/Postcode:/);
    expect(message).not.toMatch(/Preferred appointment:/);
    expect(message).not.toMatch(/Reference:/);
    expect(message).not.toMatch(/unknown/i);
    // Still a usable message.
    expect(message).toContain("Minor Service");
  });

  it("includes customer notes when there are any", () => {
    const message = buildWhatsAppMessage({ ...BASE, notes: "  Parking is tight  " });
    expect(message).toContain("Notes: Parking is tight");
  });

  it("stays within WhatsApp's practical limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      kind: "service" as const,
      id: `service-${i}`,
      name: `A service with a fairly long name number ${i}`,
      pricing: "from" as const,
      priceGbp: 100,
    }));
    const message = buildWhatsAppMessage({ ...BASE, items: many });
    expect(message.length).toBeLessThanOrEqual(4000);
    expect(message.endsWith("…")).toBe(true);
  });
});

describe("the wa.me link", () => {
  it("encodes spaces as %20, not as plus signs", () => {
    // URLSearchParams would produce '+', which WhatsApp renders literally —
    // the customer would open a message full of plus signs.
    const href = whatsappHref("hello there", "447700900123");
    expect(href).toBe("https://wa.me/447700900123?text=hello%20there");
    expect(href).not.toContain("+");
  });

  it("strips non-digits from the number", () => {
    expect(whatsappHref("hi", "+44 7700 900123")).toContain("wa.me/447700900123");
  });

  it("encodes newlines so the message keeps its shape", () => {
    expect(whatsappHref("line one\nline two", "447700900123")).toContain("%0A");
  });
});

describe("a very long message stays sendable", () => {
  function longSnapshot(notes: string) {
    return {
      reference: null,
      createdAt: new Date().toISOString(),
      name: "Sam",
      phone: "07000 000000",
      email: "",
      registration: "AB12CDE",
      mileage: 52000,
      vehicleDescription: "Model to confirm",
      vehicleNotes: "",
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      vehicleFuel: null,
      vehicleEngine: null,
      items: [],
      indicativeTotalGbp: 0,
      hasFromPricing: false,
      quoteOnlyCount: 0,
      postcode: "GU15 2RT",
      location: null,
      locationLabel: null,
      preferredDate: null,
      preferredWindow: null,
      preferredLabel: null,
      notes,
      referralSource: "direct" as const,
      campaign: null,
    };
  }

  it("never leaves a half-character that makes the link throw", () => {
    // Nothing limits the notes field, and emoji are ordinary in a
    // WhatsApp-shaped conversation. Cutting at a fixed offset can split a
    // surrogate pair, and encodeURIComponent throws URIError on a lone
    // surrogate — killing the handoff on the final "press Send" step.
    for (let pad = 3900; pad < 4100; pad++) {
      const message = buildWhatsAppMessage(longSnapshot("x".repeat(pad) + "\u{1F697}".repeat(40)));
      expect(() => whatsappHref(message)).not.toThrow();
      expect(encodeURIComponent(message)).toBeTruthy();
    }
  });

  it("still respects the length limit", () => {
    const message = buildWhatsAppMessage(longSnapshot("y".repeat(9000)));
    expect(message.length).toBeLessThanOrEqual(4000);
  });

  it("leaves a message under the limit exactly as built", () => {
    const message = buildWhatsAppMessage(longSnapshot("just a short note"));
    expect(message).toContain("just a short note");
    expect(message.endsWith("…")).toBe(false);
  });
});
