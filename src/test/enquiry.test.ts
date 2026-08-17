import { describe, expect, it } from "vitest";

import { EMPTY_DRAFT, type QuoteDraft } from "@/lib/basket";
import {
  buildSnapshot,
  validateDraft,
  ENQUIRY_STATUS_LABEL,
  LIMITS,
  OPEN_STATUSES,
} from "@/lib/enquiry";

function draft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    ...EMPTY_DRAFT,
    ...overrides,
    vehicle: { ...EMPTY_DRAFT.vehicle, ...overrides.vehicle },
    location: { ...EMPTY_DRAFT.location, ...overrides.location },
    timing: { ...EMPTY_DRAFT.timing, ...overrides.timing },
    contact: { ...EMPTY_DRAFT.contact, ...overrides.contact },
  };
}

const COMPLETE = draft({
  vehicle: { registration: "AB12 CDE", mileage: "52,400", notes: "" },
  items: [{ kind: "service", id: "minor-service", addedAt: 0 }],
  contact: { name: "John Smith", phone: "07700900123", email: "john@example.com" },
});

describe("what the form insists on (§59)", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(COMPLETE).ok).toBe(true);
  });

  it("insists on at least one service", () => {
    const result = validateDraft(draft({ ...COMPLETE, items: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.items).toBeTruthy();
  });

  it("insists on a registration", () => {
    const result = validateDraft(
      draft({ ...COMPLETE, vehicle: { registration: "", mileage: "", notes: "" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.registration).toBeTruthy();
  });

  it("insists on a name and a usable phone number", () => {
    const noName = validateDraft(
      draft({ ...COMPLETE, contact: { name: "", phone: "07700900123", email: "" } }),
    );
    expect(noName.errors.name).toBeTruthy();

    const shortPhone = validateDraft(
      draft({ ...COMPLETE, contact: { name: "John", phone: "123", email: "" } }),
    );
    expect(shortPhone.errors.phone).toBeTruthy();
  });

  it("treats email as optional but checks one that was given", () => {
    const withoutEmail = validateDraft(
      draft({ ...COMPLETE, contact: { name: "John", phone: "07700900123", email: "" } }),
    );
    expect(withoutEmail.ok).toBe(true);

    const withTypo = validateDraft(
      draft({ ...COMPLETE, contact: { name: "John", phone: "07700900123", email: "john@" } }),
    );
    expect(withTypo.errors.email).toBeTruthy();
  });

  it("writes errors in plain English with no codes (§49)", () => {
    const result = validateDraft(EMPTY_DRAFT);
    for (const message of Object.values(result.errors)) {
      expect(message).toMatch(/^[A-Z]/);
      expect(message).toMatch(/[.?]$/);
      expect(message).not.toMatch(/[A-Z_]{4,}/);
    }
  });
});

describe("the submitted snapshot (§27)", () => {
  it("freezes the basket with the prices the customer was shown", () => {
    const snapshot = buildSnapshot(COMPLETE);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].id).toBe("minor-service");
    expect(snapshot.items[0].pricing).toBe("from");
    expect(snapshot.indicativeTotalGbp).toBeGreaterThan(0);
    expect(snapshot.hasFromPricing).toBe(true);
  });

  it("normalises the registration and parses the mileage", () => {
    const snapshot = buildSnapshot(COMPLETE);
    expect(snapshot.registration).toBe("AB12CDE");
    expect(snapshot.mileage).toBe(52400);
  });

  it("never invents a vehicle description (§21)", () => {
    expect(buildSnapshot(COMPLETE).vehicleDescription).toBe("Model to confirm");
  });

  it("records a package's contents so a job card can be built", () => {
    const snapshot = buildSnapshot(
      draft({ ...COMPLETE, items: [{ kind: "package", id: "cabin-refresh", addedAt: 0 }] }),
    );
    expect(snapshot.items[0].kind).toBe("package");
    expect(snapshot.items[0].contains).toContain("ac-cabin-hygiene");
  });

  it("counts quote-only items separately from the total", () => {
    const snapshot = buildSnapshot(
      draft({
        ...COMPLETE,
        items: [
          { kind: "service", id: "minor-service", addedAt: 0 },
          { kind: "service", id: "oil-leak-repair", addedAt: 0 },
        ],
      }),
    );
    expect(snapshot.quoteOnlyCount).toBe(1);
    // The quote-only item contributes nothing to the figure.
    expect(snapshot.indicativeTotalGbp).toBe(149);
  });

  it("has no reference until the database gives it one", () => {
    expect(buildSnapshot(COMPLETE).reference).toBeNull();
  });

  it("trims whitespace out of everything a human typed", () => {
    const snapshot = buildSnapshot(
      draft({
        ...COMPLETE,
        contact: { name: "  John Smith  ", phone: " 07700900123 ", email: " a@b.com " },
        notes: "  something  ",
      }),
    );
    expect(snapshot.name).toBe("John Smith");
    expect(snapshot.email).toBe("a@b.com");
    expect(snapshot.notes).toBe("something");
  });

  it("upper-cases the postcode", () => {
    const snapshot = buildSnapshot(
      draft({ ...COMPLETE, location: { kind: "home", postcode: " gu15 " } }),
    );
    expect(snapshot.postcode).toBe("GU15");
  });

  it("builds a readable preferred appointment, and null when there isn't one", () => {
    const withTiming = buildSnapshot(
      draft({ ...COMPLETE, timing: { preferredDate: "2026-08-21", window: "morning" } }),
    );
    expect(withTiming.preferredLabel).toBe("Friday 21 August, morning");

    expect(buildSnapshot(COMPLETE).preferredLabel).toBeNull();
  });

  it("survives a bad date rather than rendering 'Invalid Date'", () => {
    const snapshot = buildSnapshot(
      draft({ ...COMPLETE, timing: { preferredDate: "not-a-date", window: null } }),
    );
    expect(snapshot.preferredLabel).toBeNull();
  });
});

describe("enquiry statuses (§27)", () => {
  it("labels every status", () => {
    for (const label of Object.values(ENQUIRY_STATUS_LABEL)) {
      expect(label).toBeTruthy();
    }
  });

  it("treats completed and lost as closed", () => {
    expect(OPEN_STATUSES).not.toContain("completed");
    expect(OPEN_STATUSES).not.toContain("lost");
  });

  it("covers all nine statuses the brief lists", () => {
    expect(Object.keys(ENQUIRY_STATUS_LABEL)).toHaveLength(9);
  });
});

describe("client validation matches what Postgres will accept", () => {
  /**
   * create_enquiry raises on anything outside these limits, and submitEnquiry
   * can only turn that into "we couldn't save your request" — a dead end with
   * nothing for the customer to correct. Each case below reached the database
   * and came back as that generic failure before validateDraft checked it.
   */

  function draftWith(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
    return {
      ...EMPTY_DRAFT,
      vehicle: { registration: "AB12CDE", mileage: "52000", notes: "" },
      items: [{ kind: "service", id: "minor-service", addedAt: 1 }],
      contact: { name: "Sam", phone: "07000 000000", email: "" },
      ...overrides,
    };
  }

  it("accepts a normal request", () => {
    expect(validateDraft(draftWith()).ok).toBe(true);
  });

  it("catches a note longer than the database column allows", () => {
    // The realistic one: someone describing an awkward intermittent fault.
    const result = validateDraft(draftWith({ notes: "x".repeat(LIMITS.notes + 1) }));
    expect(result.ok).toBe(false);
    expect(result.errors.notes).toBeTruthy();
  });

  it("accepts a note exactly on the limit", () => {
    expect(validateDraft(draftWith({ notes: "x".repeat(LIMITS.notes) })).ok).toBe(true);
  });

  it("catches a basket larger than the database allows", () => {
    const items = Array.from({ length: LIMITS.items + 1 }, (_, i) => ({
      kind: "service" as const,
      id: `service-${i}`,
      addedAt: i,
    }));
    const result = validateDraft(draftWith({ items }));
    expect(result.ok).toBe(false);
    expect(result.errors.items).toBeTruthy();
  });

  it("accepts a basket exactly on the limit", () => {
    const items = Array.from({ length: LIMITS.items }, (_, i) => ({
      kind: "service" as const,
      id: `service-${i}`,
      addedAt: i,
    }));
    expect(validateDraft(draftWith({ items })).ok).toBe(true);
  });

  it("catches an over-long name, phone and email", () => {
    expect(
      validateDraft(
        draftWith({ contact: { name: "n".repeat(121), phone: "07000000000", email: "" } }),
      ).errors.name,
    ).toBeTruthy();
    expect(
      validateDraft(
        draftWith({ contact: { name: "Sam", phone: `0700000000${"0".repeat(30)}`, email: "" } }),
      ).errors.phone,
    ).toBeTruthy();
    expect(
      validateDraft(
        draftWith({
          contact: { name: "Sam", phone: "07000000000", email: `${"e".repeat(250)}@example.com` },
        }),
      ).errors.email,
    ).toBeTruthy();
  });

  it("catches an over-long vehicle note", () => {
    const result = validateDraft(
      draftWith({
        vehicle: {
          registration: "AB12CDE",
          mileage: "",
          notes: "v".repeat(LIMITS.vehicleNotes + 1),
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.vehicleNotes).toBeTruthy();
  });

  it("explains the problem in plain English, with no codes (§49)", () => {
    const result = validateDraft(draftWith({ notes: "x".repeat(LIMITS.notes + 1) }));
    for (const message of Object.values(result.errors)) {
      expect(message).toMatch(/[a-z]/);
      expect(message).not.toMatch(/error|invalid|constraint|null|undefined|P0001|\bcode\b/i);
    }
  });
});

describe("every validation error can actually reach the customer", () => {
  it("produces only keys the quote form knows how to show", () => {
    /**
     * quote.tsx renders each of these next to its field and routes the
     * customer back to the step that owns it. An error key that isn't in this
     * list would block submission while displaying nothing: the button stops
     * working and no reason is given.
     *
     * If this fails, a new validation rule was added. Render it in quote.tsx
     * and route it in onSubmit, then add it here.
     */
    const handled = new Set([
      "items",
      "registration",
      "vehicleNotes",
      "name",
      "phone",
      "email",
      "notes",
    ]);

    // A draft that violates every rule at once, so every key appears.
    const worst = {
      ...EMPTY_DRAFT,
      vehicle: { registration: "", mileage: "", notes: "v".repeat(LIMITS.vehicleNotes + 1) },
      items: [],
      contact: { name: "", phone: "", email: "not-an-email" },
      notes: "x".repeat(LIMITS.notes + 1),
    };

    const keys = Object.keys(validateDraft(worst).errors);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(handled.has(key), `"${key}" is not rendered by the quote form`).toBe(true);
    }
  });
});
