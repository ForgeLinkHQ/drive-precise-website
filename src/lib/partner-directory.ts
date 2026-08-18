/**
 * The published partner list (§18).
 *
 * Two halves of the partner network exist and must never meet. The commercial
 * half — trade terms, commission type and value, internal notes — lives in the
 * `partners` table and is reachable only through admin. This module is the
 * other half: the five columns a customer may see.
 *
 * The safety property is enforced in Postgres rather than here.
 * `get_public_partners()` is a SECURITY DEFINER function with a named column
 * list, and the table itself has anon revoked. A row-level policy could not
 * express "these columns but not those", which is exactly why the function
 * exists. This file could not leak a commission if it tried, because the
 * server never sends one.
 *
 * Nothing here is required for the page to work. A partner list that fails to
 * load leaves the categories rendered and the named businesses absent, which
 * is the same thing the page shows before anyone has been signed.
 */

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicPartnerRow } from "@/integrations/supabase/types";
import { PARTNER_LABEL } from "./partners";
import type { PartnerCategory } from "./services";

export interface PublicPartner {
  businessName: string;
  category: PartnerCategory;
  location: string | null;
  website: string | null;
  summary: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Only http(s), and only when it parses.
 *
 * A partner's website is typed by hand into an admin box and rendered as a
 * link on a public page. Passing it through `new URL` refuses `javascript:`
 * and anything else that is not a real web address.
 */
export function safeWebsite(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A row from the database, or null when it isn't usable. */
export function rowToPartner(row: PublicPartnerRow): PublicPartner | null {
  const businessName = text(row?.business_name);
  const category = text(row?.category);
  // An unrecognised category has no heading and no blurb to sit under, so the
  // partner would render in a section that does not exist.
  if (!businessName || !category || !(category in PARTNER_LABEL)) return null;

  return {
    businessName,
    category: category as PartnerCategory,
    location: text(row.location),
    website: safeWebsite(row.website),
    summary: text(row.public_summary),
  };
}

/** Partners grouped under their category, in the site's category order. */
export function groupByCategory(
  partners: PublicPartner[],
): { category: PartnerCategory; partners: PublicPartner[] }[] {
  const groups = new Map<PartnerCategory, PublicPartner[]>();
  for (const partner of partners) {
    const list = groups.get(partner.category) ?? [];
    list.push(partner);
    groups.set(partner.category, list);
  }

  return (Object.keys(PARTNER_LABEL) as PartnerCategory[])
    .filter((category) => groups.has(category))
    .map((category) => ({ category, partners: groups.get(category) ?? [] }));
}

// ── Store ─────────────────────────────────────────────────────────────────
//
// Same shape as the catalogue store, and for the same reason: this app server
// renders, and a fetch resolving mid-hydration is a mismatch that throws away
// the server's markup.

export interface PartnerDirectory {
  partners: PublicPartner[];
  loading: boolean;
}

const EMPTY: PartnerDirectory = { partners: [], loading: true };

let snapshot: PartnerDirectory = EMPTY;
let cache: PartnerDirectory | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function publish(next: PartnerDirectory) {
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
    const { data, error } = await supabase.rpc("get_public_partners");
    if (error || !Array.isArray(data)) {
      publish({ partners: [], loading: false });
      return;
    }

    const partners = (data as PublicPartnerRow[])
      .map(rowToPartner)
      .filter((p): p is PublicPartner => p !== null);

    const next = { partners, loading: false };
    cache = next;
    publish(next);
  } catch {
    // No partners is a legitimate state, not an error state. The page is
    // written to read correctly with an empty list.
    publish({ partners: [], loading: false });
  } finally {
    inflight = null;
  }
}

function fetchPartners() {
  if (cache) {
    if (snapshot !== cache) publish(cache);
    return;
  }
  if (!inflight) inflight = load();
}

/** Test seam — module state would otherwise leak between cases. */
export function resetPartnerDirectory() {
  cache = null;
  inflight = null;
  snapshot = EMPTY;
}

export function usePartnerDirectory(): PartnerDirectory {
  const directory = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );

  useEffect(() => {
    fetchPartners();
  }, []);

  return directory;
}
