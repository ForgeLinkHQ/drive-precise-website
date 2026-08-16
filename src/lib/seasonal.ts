/**
 * The seasonal nudge (§37).
 *
 * The campaign table drives the homepage banner and needs someone to write a
 * row. This is the floor underneath it: a sensible, always-correct seasonal
 * prompt derived from the calendar, so the homepage is never generic even
 * before anyone has set a campaign up.
 *
 * The wording is the point. §35 asks for recognisable situations rather than
 * fear — "hit a pothole hard enough to make you wince", not "your suspension
 * may be dangerously damaged". Each of these is a thing that is genuinely
 * true in that month, offering a service that genuinely addresses it.
 *
 * A real campaign row always wins; this is what shows when there isn't one.
 */

import { currentSeason } from "./addons";
import type { Season } from "./services";

export interface SeasonalPrompt {
  season: Season;
  /** Short label for the eyebrow. */
  label: string;
  headline: string;
  body: string;
  /** A package id, preferred — packages are the better-value answer. */
  packageId?: string;
  /** Or a service id where no package fits. */
  serviceId?: string;
  ctaLabel: string;
}

const PROMPTS: Record<Season, SeasonalPrompt> = {
  winter: {
    season: "winter",
    label: "This time of year",
    headline: "Cold mornings find every weak battery in Surrey",
    body: "Batteries fail in the cold, not in August. Ten minutes with a tester tells you whether yours will start the car in January — and the roads are full of potholes that weren't there in October.",
    packageId: "winter-ready",
    ctaLabel: "See what a Winter Ready check covers",
  },
  spring: {
    season: "spring",
    label: "This time of year",
    headline: "A winter's worth of potholes leaves a mark",
    body: "If the car has felt different since you hit something hard, spring is when it shows up — uneven tyre wear, a pull to one side, a knock over speed bumps. Worth checking before it costs you a set of tyres.",
    serviceId: "pothole-impact-check",
    ctaLabel: "See what a pothole check covers",
  },
  summer: {
    season: "summer",
    label: "This time of year",
    headline: "Taking the family away?",
    body: "A pre-journey check catches the simple things here rather than on a motorway two hundred miles from home. And if the air conditioning has started to smell, that's a fifty-minute fix, not something you live with.",
    packageId: "road-trip-ready",
    ctaLabel: "See what a Road Trip check covers",
  },
  autumn: {
    season: "autumn",
    label: "This time of year",
    headline: "The clocks go back and you notice your wipers",
    body: "Dark, wet drives home show up tired blades, dim bulbs and thin tread all at once. Cheap to put right now; miserable to put up with until March.",
    packageId: "winter-ready",
    ctaLabel: "Get ready for winter",
  },
};

export function seasonalPrompt(now: Date = new Date()): SeasonalPrompt {
  return PROMPTS[currentSeason(now)];
}
