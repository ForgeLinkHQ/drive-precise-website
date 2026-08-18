/**
 * Seasonal promotions (§25).
 *
 * The rule this file lives under is short: never fabricate savings. It has
 * teeth here that it does not have elsewhere, because a struck-through price
 * is the most regulated thing a small business can put on a website.
 *
 * Since April 2025 the Digital Markets, Competition and Consumers Act 2024 has
 * covered this, it applies to services as well as goods, and the CMA's
 * published principles on reference pricing are specific: a "was" price must
 * have been the real selling price for a sufficient period, thirty days being
 * the figure the CMA points at; the discount must follow on immediately; and
 * it should not run longer than the period that established the price.
 *
 * **None of that is enforced here.** It is enforced in Postgres, by
 * `get_active_promotions()`, which joins against an automatically-written
 * price history and returns nothing it cannot substantiate. This module can
 * therefore trust that anything it receives is provable, which is the only
 * arrangement worth having: a rule that lives in a React component is one
 * careless render away from being broken.
 *
 * What this file does is present it — and refuse to render a saving whose
 * arithmetic does not hold, as a second line of defence.
 */

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ActivePromotionRow } from "@/integrations/supabase/types";
import type { Season } from "./services";

export interface Promotion {
  id: string;
  serviceId: string;
  serviceName: string;
  headline: string;
  /** Why this offer exists, now. Never "limited time only". */
  reason: string | null;
  /** What it covers and excludes. Shown beside the price, never behind a link. */
  terms: string | null;
  season: Season | null;
  priceGbp: number;
  /** The service's current catalogue price. Always higher than `priceGbp`. */
  wasGbp: number;
  savingGbp: number;
  endsOn: string;
}

const SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A row from the database, or null when it isn't presentable.
 *
 * The arithmetic check duplicates one the database already made. That is
 * deliberate: this is the number a customer reads, and a saving that does not
 * subtract correctly is worse than no promotion at all.
 */
export function rowToPromotion(row: ActivePromotionRow): Promotion | null {
  const price = num(row?.promo_price_gbp);
  const was = num(row?.reference_price_gbp);
  const serviceId = text(row?.service_id);
  const serviceName = text(row?.service_name);
  const headline = text(row?.headline);

  if (!serviceId || !serviceName || !headline) return null;
  if (price === null || was === null) return null;
  // No saving, or a negative one, is not a promotion.
  if (was <= price || price < 0) return null;

  const season = text(row.season);

  return {
    id: text(row.id) ?? serviceId,
    serviceId,
    serviceName,
    headline,
    reason: text(row.reason),
    terms: text(row.terms),
    season: season && (SEASONS as string[]).includes(season) ? (season as Season) : null,
    priceGbp: price,
    wasGbp: was,
    savingGbp: Math.round((was - price) * 100) / 100,
    endsOn: text(row.ends_on) ?? "",
  };
}

/** "until Tuesday 16 September". A real deadline, stated plainly. */
export function formatEndsOn(endsOn: string): string | null {
  if (!endsOn) return null;
  const date = new Date(`${endsOn}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** Days left, or null. Negative would mean the database let an expired one through. */
export function daysRemaining(endsOn: string, now: Date = new Date()): number | null {
  if (!endsOn) return null;
  const end = new Date(`${endsOn}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - midnight.getTime()) / 86_400_000);
}

// ── Store ─────────────────────────────────────────────────────────────────

export interface PromotionSet {
  promotions: Promotion[];
  loading: boolean;
}

const EMPTY: PromotionSet = { promotions: [], loading: true };

let snapshot: PromotionSet = EMPTY;
let cache: PromotionSet | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function publish(next: PromotionSet) {
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
    const { data, error } = await supabase.rpc("get_active_promotions");
    if (error || !Array.isArray(data)) {
      publish({ promotions: [], loading: false });
      return;
    }
    const promotions = (data as ActivePromotionRow[])
      .map(rowToPromotion)
      .filter((p): p is Promotion => p !== null);

    const next = { promotions, loading: false };
    cache = next;
    publish(next);
  } catch {
    // No promotions is an ordinary state, not an error state. Between
    // campaigns there simply aren't any, and the page is written for that.
    publish({ promotions: [], loading: false });
  } finally {
    inflight = null;
  }
}

function fetchPromotions() {
  if (cache) {
    if (snapshot !== cache) publish(cache);
    return;
  }
  if (!inflight) inflight = load();
}

/** Test seam — module state would otherwise leak between cases. */
export function resetPromotions() {
  cache = null;
  inflight = null;
  snapshot = EMPTY;
}

export function usePromotions(): PromotionSet {
  const set = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );

  useEffect(() => {
    fetchPromotions();
  }, []);

  return set;
}
