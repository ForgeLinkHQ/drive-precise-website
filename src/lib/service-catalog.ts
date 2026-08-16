/**
 * The catalogue, read from the database with the shipped one underneath.
 *
 * Precedence:
 *   1. `get_public_services()` / `get_public_packages()`, when they return rows.
 *   2. The arrays in services.ts and packages.ts.
 *
 * The fallback is not a formality. If Supabase is unreachable the site still
 * renders a full menu with prices, the builder still works, and the customer
 * can still reach WhatsApp with everything they chose. Only *storing* the
 * enquiry needs the database to be there.
 *
 * `useSyncExternalStore` with a stable server snapshot, rather than useState:
 * this app server-renders, the fetch can resolve while React is still
 * hydrating, and a setState at that moment is a hydration mismatch that throws
 * away the server's markup.
 */

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicPackageRow, PublicServiceRow } from "@/integrations/supabase/types";
import {
  SERVICES,
  CATEGORY_LABEL,
  type MobileSuitability,
  type PartnerCategory,
  type PricingType,
  type Season,
  type Service,
  type ServiceCategory,
  type CustomerType,
  type ModStream,
} from "./services";
import { PACKAGES, type ServicePackage } from "./packages";

export interface Catalogue {
  services: Service[];
  packages: ServicePackage[];
  /** True until the database answers. The shipped menu renders meanwhile. */
  loading: boolean;
  /** True when what you're looking at came from the database. */
  fromDatabase: boolean;
}

const KNOWN_CATEGORIES = Object.keys(CATEGORY_LABEL) as ServiceCategory[];

/** A finite number, or undefined. NUMERIC arrives as a string over PostgREST. */
function num(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A JSONB column that should hold an array of strings. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function isPricingType(value: string): value is PricingType {
  return value === "fixed" || value === "from" || value === "quote";
}

function isCategory(value: string): value is ServiceCategory {
  return (KNOWN_CATEGORIES as string[]).includes(value);
}

/**
 * A database row as a `Service`.
 *
 * Returns null rather than a half-built object when something essential is
 * missing or contradictory — a menu entry with a broken price is worse than one
 * fewer menu entry. In particular a `fixed`/`from` row with no number is
 * rejected here as well as by the CHECK constraint, because this code also runs
 * against whatever a future migration leaves behind.
 */
export function rowToService(row: PublicServiceRow): Service | null {
  if (!row.id || !row.name) return null;
  if (!isCategory(row.category)) return null;
  if (!isPricingType(row.pricing)) return null;

  const priceGbp = num(row.price_gbp);
  if (row.pricing !== "quote" && priceGbp === undefined) return null;
  if (priceGbp !== undefined && priceGbp < 0) return null;

  const duration = num(row.duration_minutes);

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    includes: stringArray(row.includes),
    pricing: row.pricing,
    priceGbp: row.pricing === "quote" ? undefined : priceGbp,
    priceSuffix: row.price_suffix ?? undefined,
    // Never claimed from a database row. Confirmation is a decision a person
    // makes in admin; the public projection doesn't carry it, so anything
    // arriving here is by definition unconfirmed as far as this code knows.
    priceConfirmed: false,
    durationMinutes: duration !== undefined && duration > 0 ? duration : undefined,
    mobile: (["yes", "no", "conditional"] as const).includes(row.mobile as MobileSuitability)
      ? (row.mobile as MobileSuitability)
      : "conditional",
    workshopRecommended: row.workshop_recommended ?? false,
    collectionAvailable: row.collection_available ?? true,
    requiresPartsQuote: row.requires_parts_quote ?? false,
    addOns: stringArray(row.add_ons),
    incompatibleWith: stringArray(row.incompatible_with),
    suggestsPartner: stringArray(row.suggests_partner) as PartnerCategory[],
    seasons: stringArray(row.seasons) as Season[],
    alsoIn: stringArray(row.also_in).filter(isCategory),
    customerType: (["retail", "trade", "both"] as const).includes(row.customer_type as CustomerType)
      ? (row.customer_type as CustomerType)
      : "both",
    modStream: (row.mod_stream ?? undefined) as ModStream | undefined,
    addOnOnly: row.add_on_only ?? false,
    featured: row.featured ?? false,
    active: true, // the RPC only returns active rows
  };
}

export function rowToPackage(row: PublicPackageRow): ServicePackage | null {
  if (!row.id || !row.name) return null;
  if (!isPricingType(row.pricing)) return null;

  const priceGbp = num(row.price_gbp);
  if (row.pricing !== "quote" && priceGbp === undefined) return null;

  return {
    id: row.id,
    name: row.name,
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    includes: stringArray(row.includes),
    alsoIncludes: stringArray(row.also_includes),
    pricing: row.pricing,
    priceGbp: row.pricing === "quote" ? undefined : priceGbp,
    priceConfirmed: false,
    durationMinutes: num(row.duration_minutes),
    seasons: stringArray(row.seasons) as Season[],
    customerType: (["retail", "trade", "both"] as const).includes(row.customer_type as CustomerType)
      ? (row.customer_type as CustomerType)
      : "retail",
    featured: row.featured ?? false,
    active: true,
  };
}

const SHIPPED: Catalogue = {
  services: SERVICES,
  packages: PACKAGES,
  loading: true,
  fromDatabase: false,
};

let snapshot: Catalogue = SHIPPED;
let cache: Catalogue | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function publish(next: Catalogue) {
  snapshot = next;
  for (const fn of subscribers) fn();
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

async function load(): Promise<void> {
  try {
    const [servicesResult, packagesResult] = await Promise.all([
      supabase.rpc("get_public_services"),
      supabase.rpc("get_public_packages"),
    ]);

    const serviceRows = (servicesResult.data ?? []) as PublicServiceRow[];
    const packageRows = (packagesResult.data ?? []) as PublicPackageRow[];

    const services = serviceRows.map(rowToService).filter((s): s is Service => s !== null);
    const packages = packageRows.map(rowToPackage).filter((p): p is ServicePackage => p !== null);

    // An empty table means "nothing has been published here yet" far more often
    // than "Drive Precise offers nothing". Keep the shipped menu.
    if (services.length === 0) {
      publish({ ...SHIPPED, loading: false });
      return;
    }

    const next: Catalogue = {
      services,
      // Packages fall back independently: a published service catalogue with an
      // empty package table should still offer the shipped packages rather than
      // silently dropping the upgrade logic.
      packages: packages.length > 0 ? packages : PACKAGES,
      loading: false,
      fromDatabase: true,
    };
    cache = next;
    publish(next);
  } catch {
    publish({ ...SHIPPED, loading: false });
  } finally {
    inflight = null;
  }
}

function fetchCatalogue() {
  if (cache) {
    if (snapshot !== cache) publish(cache);
    return;
  }
  // Only a successful load is cached, so a network blip doesn't pin the
  // shipped menu for the rest of the session.
  if (!inflight) inflight = load();
}

/** Test seam — module state would otherwise leak between cases. */
export function resetCatalogueCache() {
  cache = null;
  inflight = null;
  snapshot = SHIPPED;
}

function getSnapshot(): Catalogue {
  return snapshot;
}

function getServerSnapshot(): Catalogue {
  return SHIPPED;
}

export function useCatalogue(): Catalogue {
  const catalogue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    fetchCatalogue();
  }, []);

  return catalogue;
}
