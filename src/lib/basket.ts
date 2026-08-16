/**
 * The basket, and the quote draft it lives inside (§22, §23).
 *
 * Two decisions worth explaining, because both are load-bearing:
 *
 * 1. **The basket stores ids, not prices.** Resolving against the live
 *    catalogue on every render costs nothing and means a price changed in
 *    admin is the price the customer sees. The alternative — snapshotting the
 *    price when the item is added — produces the failure this codebase has
 *    already hit once elsewhere: a basket quoting last week's number for four
 *    screens and the current one on the final review. The snapshot happens
 *    exactly once, at submit, and becomes part of the immutable enquiry record.
 *
 * 2. **Totals are computed only from items that have a price.** A "quote" item
 *    contributes nothing to the number and is counted separately, so the total
 *    can never silently imply that a vehicle-specific repair is included in it.
 *    The label is "Estimated from total" and there is no code path that
 *    produces the word "total" on its own (§23).
 *
 * The store is a tiny external store rather than context, for the same reason
 * as the sibling project's catalogue: this app server-renders, and a state
 * update landing mid-hydration is a mismatch that throws away the server's
 * markup. `useSyncExternalStore` with a stable server snapshot makes the first
 * client render provably identical to the server's.
 */

import { useEffect, useSyncExternalStore } from "react";
import { SERVICES, getServiceById, type Service } from "./services";
import { getPackageById, packageServices, type ServicePackage } from "./packages";
import type { VehicleDetails } from "./vehicle";

export type ServiceLocation = "home" | "workplace" | "collection" | "unsure";
export type TimeWindow = "morning" | "afternoon" | "flexible";

export interface BasketItem {
  kind: "service" | "package";
  id: string;
  /** When it was added, so the basket can be shown in the order it was built. */
  addedAt: number;
}

export interface QuoteDraft {
  vehicle: { registration: string; mileage: string; notes: string };
  items: BasketItem[];
  location: { kind: ServiceLocation | null; postcode: string };
  timing: { preferredDate: string; window: TimeWindow | null };
  contact: { name: string; phone: string; email: string };
  notes: string;
}

export const EMPTY_DRAFT: QuoteDraft = {
  vehicle: { registration: "", mileage: "", notes: "" },
  items: [],
  location: { kind: null, postcode: "" },
  timing: { preferredDate: "", window: null },
  contact: { name: "", phone: "", email: "" },
  notes: "",
};

// ── Persistence ───────────────────────────────────────────────────────────
//
// localStorage, deliberately. §59 asks that the basket survive navigation and
// that selections are not lost going backwards, and a customer who half-builds
// a quote on the train should find it there that evening. This is functional
// storage rather than tracking — it holds what they chose, not who they are —
// and the cookie policy says exactly that.

const STORAGE_KEY = "dp.quote-draft.v1";

function readStorage(): QuoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuoteDraft>;
    // Merge over the empty draft rather than trusting the stored shape: this
    // value can be months old and predate fields added since.
    return {
      ...EMPTY_DRAFT,
      ...parsed,
      vehicle: { ...EMPTY_DRAFT.vehicle, ...parsed.vehicle },
      location: { ...EMPTY_DRAFT.location, ...parsed.location },
      timing: { ...EMPTY_DRAFT.timing, ...parsed.timing },
      contact: { ...EMPTY_DRAFT.contact, ...parsed.contact },
      items: Array.isArray(parsed.items) ? parsed.items.filter(isBasketItem) : [],
    };
  } catch {
    // Corrupt or unreadable storage must never break the page — a customer
    // with a broken draft should get an empty one, not an error boundary.
    return null;
  }
}

function isBasketItem(value: unknown): value is BasketItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<BasketItem>;
  return (
    (item.kind === "service" || item.kind === "package") &&
    typeof item.id === "string" &&
    item.id.length > 0
  );
}

function writeStorage(draft: QuoteDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing and full quotas both throw here. The basket still works
    // for this visit; it just doesn't survive a reload.
  }
}

// ── Store ─────────────────────────────────────────────────────────────────

/** Referentially stable — React compares store snapshots by identity. */
const SERVER_SNAPSHOT: QuoteDraft = EMPTY_DRAFT;

let snapshot: QuoteDraft = SERVER_SNAPSHOT;
let hydrated = false;
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) fn();
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

/**
 * Load the stored draft. Called from an effect, never from `subscribe`.
 *
 * This distinction caused a real hydration failure and is worth stating
 * plainly. React calls `subscribe` during the commit that hydrates the tree,
 * and it then re-reads `getSnapshot()`. Mutating the snapshot inside
 * `subscribe` therefore changed the answer *mid-hydration* — the server had
 * rendered an empty basket, the client suddenly had three items, and React
 * threw #418 and discarded the server's markup.
 *
 * Running it in an effect means hydration completes against the same empty
 * draft the server rendered, and the stored basket arrives one tick later as a
 * normal update. The visible cost is a single frame without the resume banner,
 * which is the correct trade for markup that actually hydrates.
 */
function hydrateFromStorage() {
  if (hydrated) return;
  hydrated = true;
  const stored = readStorage();
  if (stored) {
    snapshot = stored;
    emit();
  }
}

function getSnapshot(): QuoteDraft {
  return snapshot;
}

function getServerSnapshot(): QuoteDraft {
  return SERVER_SNAPSHOT;
}

function update(next: QuoteDraft) {
  snapshot = next;
  writeStorage(next);
  emit();
}

/** Test seam — module state would otherwise leak between cases. */
export function resetDraft() {
  snapshot = SERVER_SNAPSHOT;
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }
  emit();
}

export function useQuoteDraft(): QuoteDraft {
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    hydrateFromStorage();
  }, []);

  return draft;
}

export function getDraft(): QuoteDraft {
  return snapshot;
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function addItem(kind: "service" | "package", id: string) {
  const draft = getDraft();
  if (draft.items.some((i) => i.id === id)) return;

  // Adding something removes anything it is incompatible with, rather than
  // letting both sit in the basket and quoting the customer for a set of front
  // pads and a set of front discs-and-pads at the same time.
  const incompatible = incompatibleIds(kind, id);
  const items = draft.items
    .filter((i) => !incompatible.has(i.id))
    .concat({ kind, id, addedAt: Date.now() });

  update({ ...draft, items });
}

export function removeItem(id: string) {
  const draft = getDraft();
  update({ ...draft, items: draft.items.filter((i) => i.id !== id) });
}

export function toggleItem(kind: "service" | "package", id: string) {
  if (getDraft().items.some((i) => i.id === id)) removeItem(id);
  else addItem(kind, id);
}

/**
 * Imperative read. Safe in event handlers; **not** safe during render.
 *
 * Use `useHasItem` in components. This reads the module singleton directly,
 * and a component that calls it while rendering can observe a value React
 * never saw — which is exactly the hydration failure described below.
 */
export function hasItem(id: string): boolean {
  return getDraft().items.some((i) => i.id === id);
}

/**
 * Whether an item is in the basket, read through the subscribed snapshot.
 *
 * The distinction from `hasItem` is not stylistic; it cost a real hydration
 * failure. During hydration React flushes the first mounted component's
 * passive effects before the rest of the tree has hydrated. The header mounts
 * first, its effect loaded the stored draft, and every service card *below* it
 * then hydrated against a basket the server had never rendered — server said
 * "Add", client said "Added", and React threw #418 and regenerated the tree.
 *
 * Deriving from the value `useSyncExternalStore` returned makes that
 * impossible: React controls when that value changes, so a render can never
 * observe a store mutation it wasn't told about.
 */
export function useHasItem(id: string): boolean {
  const draft = useQuoteDraft();
  return draft.items.some((i) => i.id === id);
}

export function setVehicle(vehicle: Partial<QuoteDraft["vehicle"]>) {
  const draft = getDraft();
  update({ ...draft, vehicle: { ...draft.vehicle, ...vehicle } });
}

export function setLocation(location: Partial<QuoteDraft["location"]>) {
  const draft = getDraft();
  update({ ...draft, location: { ...draft.location, ...location } });
}

export function setTiming(timing: Partial<QuoteDraft["timing"]>) {
  const draft = getDraft();
  update({ ...draft, timing: { ...draft.timing, ...timing } });
}

export function setContact(contact: Partial<QuoteDraft["contact"]>) {
  const draft = getDraft();
  update({ ...draft, contact: { ...draft.contact, ...contact } });
}

export function setNotes(notes: string) {
  update({ ...getDraft(), notes });
}

export function clearDraft() {
  update(EMPTY_DRAFT);
}

/**
 * Ids that cannot coexist with the given item.
 *
 * A package pulls in its members' incompatibilities as well as its own, so
 * adding "BMW Service Plus" clears a separately-added cabin filter — which the
 * package already contains.
 */
function incompatibleIds(kind: "service" | "package", id: string): Set<string> {
  const blocked = new Set<string>();

  const collect = (service: Service | undefined) => {
    if (!service) return;
    for (const other of service.incompatibleWith ?? []) blocked.add(other);
    // The reverse direction: anything in the catalogue that declares itself
    // incompatible with what's being added.
    for (const candidate of SERVICES) {
      if (candidate.incompatibleWith?.includes(service.id)) blocked.add(candidate.id);
    }
  };

  if (kind === "service") {
    collect(getServiceById(id));
  } else {
    const pkg = getPackageById(id);
    if (pkg) {
      // Members of the package are now redundant as standalone lines.
      for (const member of pkg.includes) blocked.add(member);
      for (const member of packageServices(pkg)) collect(member);
    }
  }

  blocked.delete(id);
  return blocked;
}

// ── Resolution and totals ─────────────────────────────────────────────────

export interface ResolvedItem {
  kind: "service" | "package";
  id: string;
  name: string;
  shortDescription: string;
  pricing: "fixed" | "from" | "quote";
  priceGbp?: number;
  priceSuffix?: string;
  durationMinutes?: number;
  /** For packages: the services inside, for the basket's expandable detail. */
  contains?: Service[];
}

export function resolveItem(item: BasketItem, services: Service[] = SERVICES): ResolvedItem | null {
  if (item.kind === "package") {
    const pkg = getPackageById(item.id);
    if (!pkg) return null;
    return packageToResolved(pkg, services);
  }
  const service = services.find((s) => s.id === item.id) ?? getServiceById(item.id);
  if (!service) return null;
  return {
    kind: "service",
    id: service.id,
    name: service.name,
    shortDescription: service.shortDescription,
    pricing: service.pricing,
    priceGbp: service.priceGbp,
    priceSuffix: service.priceSuffix,
    durationMinutes: service.durationMinutes,
  };
}

function packageToResolved(pkg: ServicePackage, services: Service[]): ResolvedItem {
  return {
    kind: "package",
    id: pkg.id,
    name: pkg.name,
    shortDescription: pkg.shortDescription,
    pricing: pkg.pricing,
    priceGbp: pkg.priceGbp,
    durationMinutes: pkg.durationMinutes,
    contains: packageServices(pkg, services),
  };
}

/** Basket contents, resolved against the live catalogue. Unknown ids drop out. */
export function resolveItems(items: BasketItem[], services: Service[] = SERVICES): ResolvedItem[] {
  return items
    .map((item) => resolveItem(item, services))
    .filter((item): item is ResolvedItem => item !== null);
}

export interface BasketTotals {
  /** Sum of every item that has a number. Never presented as a final price. */
  indicativeTotalGbp: number;
  /** How many items contributed to that sum. */
  pricedCount: number;
  /** Items whose price can only be given for the specific vehicle. */
  quoteOnlyCount: number;
  /** True when any contributing price was a "From" price. */
  hasFromPricing: boolean;
  /** Total estimated time on site, where every item declares one. */
  durationMinutes: number | null;
}

/**
 * Basket arithmetic (§23).
 *
 * "The basket should calculate indicative totals ONLY from items where
 * sufficient pricing exists." So a quote-only item is counted, reported and
 * excluded from the sum — the UI shows "plus 1 item quoted for your vehicle"
 * beside the figure rather than folding a zero into it.
 */
export function basketTotals(items: ResolvedItem[]): BasketTotals {
  let indicativeTotalGbp = 0;
  let pricedCount = 0;
  let quoteOnlyCount = 0;
  let hasFromPricing = false;
  let durationMinutes = 0;
  let everyItemHasDuration = items.length > 0;

  for (const item of items) {
    if (item.pricing === "quote" || item.priceGbp === undefined) {
      quoteOnlyCount += 1;
    } else {
      indicativeTotalGbp += item.priceGbp;
      pricedCount += 1;
      if (item.pricing === "from") hasFromPricing = true;
    }
    if (item.durationMinutes === undefined) everyItemHasDuration = false;
    else durationMinutes += item.durationMinutes;
  }

  return {
    indicativeTotalGbp,
    pricedCount,
    quoteOnlyCount,
    hasFromPricing,
    durationMinutes: everyItemHasDuration ? durationMinutes : null,
  };
}

/**
 * The label above the basket figure.
 *
 * There is no branch here that returns the bare word "Total". The closest this
 * gets to a firm number is when every item is a confirmed fixed price, and even
 * then it says "estimated" — because travel, access and what the car turns out
 * to need are all still ahead of the final quote.
 */
export function totalLabel(totals: BasketTotals): string {
  if (totals.pricedCount === 0) return "Priced for your vehicle";
  if (totals.hasFromPricing) return "Estimated from total";
  return "Estimated total";
}
