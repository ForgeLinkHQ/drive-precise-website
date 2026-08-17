/**
 * First-party analytics (§41).
 *
 * §41 asks for business economics rather than page views — attachment rate,
 * package upgrade rate, quote-to-booking conversion, revenue per labour hour.
 * Most of those are computed in the database from enquiry and job data, not
 * here. What this file contributes is the front end half: the funnel steps
 * that only the browser can see, joined by a session key so "opened the
 * builder, added a service, never submitted" is an answerable question.
 *
 * What it deliberately does not do:
 *
 *   - No cookie, no localStorage. The session key lives in a module variable,
 *     so it lasts as long as the tab is on this site and vanishes on reload.
 *     That is what lets the cookie notice say what it says.
 *   - No identity. No name, no phone number, no registration. A vehicle
 *     registration is personal data under UK GDPR, and it has no business
 *     being in an analytics event.
 *   - Never blocks or breaks a page. Every call is fire-and-forget and swallows
 *     its own errors — a quote request must never fail because a counter did.
 */

import { supabase } from "@/integrations/supabase/client";
import { currentAttribution } from "./attribution";

export type SiteEvent =
  | "page_view"
  | "service_page_view"
  | "symptom_selected"
  | "search_performed"
  | "builder_started"
  | "service_added"
  | "service_removed"
  | "addon_shown"
  | "addon_added"
  | "package_upgrade_shown"
  | "package_upgrade_taken"
  | "location_step_reached"
  | "details_step_reached"
  | "review_step_reached"
  | "quote_requested"
  | "whatsapp_clicked"
  | "partner_suggested"
  | "trade_enquiry_submitted"
  | "contact_submitted";

let sessionKey: string | null = null;

function currentSessionKey(): string {
  if (sessionKey) return sessionKey;
  sessionKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return sessionKey;
}

function deviceClass(): "mobile" | "tablet" | "desktop" | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/** True when analytics should run at all. */
function enabled(): boolean {
  if (typeof window === "undefined") return false;
  // Respect Do Not Track. Not legally required for something that stores
  // nothing and identifies nobody, but a visitor who has asked not to be
  // counted has asked clearly enough.
  const dnt =
    navigator.doNotTrack === "1" ||
    (window as { doNotTrack?: string }).doNotTrack === "1" ||
    (navigator as { msDoNotTrack?: string }).msDoNotTrack === "1";
  return !dnt;
}

export interface EventDetail {
  /** Catalogue id — a service or package. Never a customer identifier. */
  itemId?: string;
  /** Basket value at the moment of the event, for funnel-value analysis. */
  basketValueGbp?: number;
  itemCount?: number;
  meta?: Record<string, string | number | boolean>;
}

/**
 * Registration-shaped tokens, for stripping out of free text.
 *
 * Only the full-length formats, deliberately. A registration is 6 to 8
 * characters, while BMW's own vocabulary is full of shorter things that look
 * just like a dateless plate: M3, X5, 330d, E46, N47, B58. Matching those
 * would gut the one analytics field that tells Drive Precise what people
 * actually search for, to protect data nobody typed.
 */
const REGISTRATION_LIKE =
  /\b(?=[A-Z0-9]{6,8}\b)(?:[A-Z]{2}\d{2}[A-Z]{3}|[A-Z]\d{1,3}[A-Z]{3}|[A-Z]{3}\d{1,3}[A-Z])\b/g;

/**
 * Free text with anything registration-shaped removed.
 *
 * The header of this file promises that no vehicle registration reaches an
 * analytics event, and until this existed that promise was only true if every
 * caller happened to behave. It wasn't: the search box sends what the customer
 * typed, and people paste a registration into any text box on a garage's
 * website. A registration is personal data under UK GDPR, the privacy policy
 * says this system holds none, and a promise enforced by good intentions at
 * the call site is not enforced at all.
 */
export function redactRegistrations(text: string): string {
  return text
    .replace(REGISTRATION_LIKE, "[reg]")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Apply that guarantee to everything a caller attaches, not just the query. */
function scrubMeta(
  meta: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = typeof value === "string" ? redactRegistrations(value) : value;
  }
  return clean;
}

export async function track(name: SiteEvent, detail: EventDetail = {}): Promise<void> {
  if (!enabled()) return;

  try {
    const attribution = currentAttribution();
    await supabase.rpc("record_site_event", {
      _name: name,
      _session_key: currentSessionKey(),
      _path: window.location.pathname,
      _device: deviceClass() ?? null,
      _item_id: detail.itemId ?? null,
      _basket_value_gbp: detail.basketValueGbp ?? null,
      _item_count: detail.itemCount ?? null,
      _referral_source: attribution.inferredSource,
      _utm_source: attribution.source ?? null,
      _utm_medium: attribution.medium ?? null,
      _utm_campaign: attribution.campaign ?? null,
      _meta: scrubMeta(detail.meta ?? {}) as never,
    });
  } catch {
    // A counter is never worth an error boundary.
  }
}

/** Fire-and-forget wrapper for call sites that shouldn't await anything. */
export function trackEvent(name: SiteEvent, detail: EventDetail = {}): void {
  void track(name, detail);
}
