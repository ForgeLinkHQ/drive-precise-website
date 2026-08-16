/**
 * The partner network (§18, §19).
 *
 * The customer-facing half of this is deliberately thin, and that is the
 * point. §18: "Do not advertise referral commissions publicly as a selling
 * point." So nothing in this module produces a price, a commission, or a
 * partner's name on a public page — the only public wording is convenience:
 * Drive Precise can arrange it.
 *
 * The commercial half lives in the database (`partners`, `partner_referrals`)
 * where referral status and commission are tracked, and is reachable only
 * through the admin screens. The two halves share the category vocabulary
 * below and nothing else.
 */

import type { PartnerCategory } from "./services";

export const PARTNER_LABEL: Record<PartnerCategory, string> = {
  tyres: "Tyres",
  alignment: "Wheel alignment",
  mot: "MOT testing",
  "wheel-refurb": "Wheel refurbishment",
  bodywork: "Bodywork",
  paint: "Paint",
  glass: "Glass",
  adas: "ADAS calibration",
  detailing: "Detailing & valeting",
};

/** The line shown to a customer when a basket implies partner work (§18). */
export const PARTNER_BLURB: Record<PartnerCategory, string> = {
  tyres: "If your car needs tyres, we can arrange this through a trusted local partner.",
  alignment:
    "Alignment is usually recommended after suspension or steering work. We can arrange it for you.",
  mot: "We're not an MOT testing station, but we can arrange the test through a local partner.",
  "wheel-refurb": "Kerbed or damaged wheels can be refurbished through one of our partners.",
  bodywork: "Bodywork can be arranged through a trusted local specialist.",
  paint: "Paintwork can be arranged through a trusted local specialist.",
  glass: "Chips and cracks can be dealt with through a glass specialist we work with.",
  adas: "Camera and sensor calibration is handled by a specialist we can arrange.",
  detailing: "Detailing and valeting can be arranged through a local partner.",
};

/** Referral lifecycle (§19). Mirrors the CHECK constraint on the table. */
export type ReferralStatus =
  | "suggested"
  | "customer_interested"
  | "referred"
  | "booked"
  | "completed"
  | "commission_due"
  | "commission_received";

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  suggested: "Suggested",
  customer_interested: "Customer interested",
  referred: "Referred",
  booked: "Booked",
  completed: "Completed",
  commission_due: "Commission due",
  commission_received: "Commission received",
};

/**
 * The wording that goes on a public page.
 *
 * A single sentence with no partner named and no commercial arrangement
 * mentioned — because who performs the work and on what terms is something
 * §48 asks be made clear at the point it becomes real, not advertised in
 * advance.
 */
export const PARTNER_DISCLAIMER =
  "Partner services are carried out by independent businesses. We'll tell you who is doing the work, and what the arrangement is, before anything is booked.";
