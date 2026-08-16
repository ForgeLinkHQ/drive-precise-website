/**
 * Site search (§53).
 *
 * "Search is not a diagnostic engine." So this matches words, and where a word
 * is one people use for a symptom rather than a part — "knocking", "pothole",
 * "smell" — it routes to the *check* that would investigate it, never to a
 * conclusion about what is wrong.
 *
 * The synonym table is the whole trick. A customer typing "brakes" is served
 * fine by substring matching; a customer typing "knocking" is not, because the
 * word appears in one description by luck rather than by design. §53 names
 * three cases explicitly and they are each covered by a test.
 */

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  retailServices,
  type Service,
  type ServiceCategory,
} from "./services";
import { activePackages, type ServicePackage } from "./packages";

export type SearchResult =
  | { kind: "service"; service: Service; score: number }
  | { kind: "package"; pkg: ServicePackage; score: number }
  | { kind: "category"; category: ServiceCategory; score: number };

/**
 * Words customers use, mapped to catalogue ids they should reach.
 *
 * Left-hand side is what someone types when they do not know the terminology
 * (§3, §53). Every id on the right is asserted to resolve, in the tests.
 */
const SYNONYMS: Record<string, string[]> = {
  knock: ["suspension-handling-check", "drop-links"],
  knocking: ["suspension-handling-check", "drop-links"],
  clunk: ["suspension-handling-check", "drop-links"],
  rattle: ["suspension-handling-check", "vehicle-health-check"],
  noise: ["suspension-handling-check", "vehicle-health-check"],
  pothole: ["pothole-impact-check"],
  kerb: ["pothole-impact-check"],
  bump: ["pothole-impact-check", "suspension-handling-check"],
  vibration: ["suspension-handling-check", "tyre-health-check"],
  shake: ["suspension-handling-check", "tyre-health-check"],
  wobble: ["suspension-handling-check", "tyre-health-check"],
  pull: ["suspension-handling-check"],
  pulling: ["suspension-handling-check"],
  squeal: ["brake-health-check"],
  squeak: ["brake-health-check"],
  grinding: ["brake-health-check"],
  stop: ["brake-health-check"],
  smell: ["ac-cabin-hygiene", "cabin-filter"],
  smells: ["ac-cabin-hygiene", "cabin-filter"],
  musty: ["ac-cabin-hygiene"],
  damp: ["ac-cabin-hygiene"],
  aircon: ["ac-cabin-hygiene"],
  "air-con": ["ac-cabin-hygiene"],
  ac: ["ac-cabin-hygiene"],
  conditioning: ["ac-cabin-hygiene"],
  oil: ["minor-service", "oil-leak-repair"],
  leak: ["oil-leak-repair", "coolant-leak-repair"],
  leaking: ["oil-leak-repair", "coolant-leak-repair"],
  drip: ["oil-leak-repair", "coolant-leak-repair"],
  overheating: ["coolant-leak-repair", "cooling-system-components"],
  hot: ["coolant-leak-repair", "summer-health-check"],
  mot: ["pre-mot-check", "mot-failure-repair"],
  failed: ["mot-failure-repair"],
  buying: ["pre-purchase-inspection"],
  bought: ["new-to-you-check"],
  holiday: ["road-trip-check"],
  trip: ["road-trip-check"],
  france: ["road-trip-check"],
  winter: ["winter-health-check"],
  cold: ["winter-health-check", "battery-health-check"],
  battery: ["battery-health-check", "battery-replacement"],
  starting: ["battery-health-check"],
  flat: ["battery-health-check", "tyre-health-check"],
  tyre: ["tyre-health-check"],
  tyres: ["tyre-health-check"],
  tire: ["tyre-health-check"],
  wipers: ["wiper-blades", "wet-weather-check"],
  lights: ["bulb-replacement", "wet-weather-check"],
  bulb: ["bulb-replacement"],
  service: ["minor-service", "major-service"],
  springs: ["lowering-springs", "springs"],
  lowering: ["lowering-springs"],
  lowered: ["lowering-springs"],
  splitter: ["front-splitter-fitting", "styling-removal"],
  standard: ["return-to-standard-full"],
  stock: ["return-to-standard-full"],
  demod: ["return-to-standard-full"],
  remove: ["return-to-standard-full", "styling-removal"],
  intake: ["induction-kit-fitting", "intake-removal-oem-airbox"],
  downpipe: ["downpipe-fitting", "downpipe-removal"],
  first: ["vehicle-health-check"],
  daughter: ["vehicle-health-check"],
  son: ["vehicle-health-check"],
  young: ["vehicle-health-check"],
  collect: ["collection-and-return"],
  collection: ["collection-and-return"],
  ramp: ["workshop-supported-repair"],
};

function tokenise(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Scores for the different ways something can match, highest intent first. */
const SCORE = {
  exactName: 100,
  nameStartsWith: 80,
  nameContains: 60,
  synonym: 50,
  shortDescription: 30,
  description: 15,
  category: 10,
} as const;

function scoreText(tokens: string[], name: string, short: string, long: string): number {
  const lowerName = name.toLowerCase();
  const lowerShort = short.toLowerCase();
  const lowerLong = long.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (lowerName === token) score += SCORE.exactName;
    else if (lowerName.startsWith(token)) score += SCORE.nameStartsWith;
    else if (lowerName.includes(token)) score += SCORE.nameContains;
    else if (lowerShort.includes(token)) score += SCORE.shortDescription;
    else if (lowerLong.includes(token)) score += SCORE.description;
  }

  return score;
}

/**
 * Search the catalogue.
 *
 * Returns services, packages and category pages together, best match first.
 * An empty query returns nothing rather than everything — a search box that
 * dumps the whole catalogue on focus is noise.
 */
export function searchCatalogue(query: string, services?: Service[]): SearchResult[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];

  const pool = retailServices(services);
  const scores = new Map<string, number>();

  for (const service of pool) {
    const score = scoreText(
      tokens,
      service.name,
      service.shortDescription,
      `${service.description} ${service.includes?.join(" ") ?? ""}`,
    );
    if (score > 0) scores.set(service.id, score);
  }

  // Synonyms add to whatever text matching already found, so "brake noise"
  // ranks the brake check above a service that merely mentions brakes.
  for (const token of tokens) {
    for (const id of SYNONYMS[token] ?? []) {
      if (!pool.some((s) => s.id === id)) continue;
      scores.set(id, (scores.get(id) ?? 0) + SCORE.synonym);
    }
  }

  const results: SearchResult[] = [];

  for (const [id, score] of scores) {
    const service = pool.find((s) => s.id === id);
    if (service) results.push({ kind: "service", service, score });
  }

  for (const pkg of activePackages()) {
    const score = scoreText(tokens, pkg.name, pkg.shortDescription, pkg.description);
    if (score > 0) results.push({ kind: "package", pkg, score });
  }

  // CATEGORY_ORDER rather than every key of CATEGORY_LABEL: diagnostics has a
  // label but must not be reachable from anywhere, search included (§46).
  for (const category of CATEGORY_ORDER) {
    const lower = CATEGORY_LABEL[category].toLowerCase();
    if (tokens.some((t) => lower.includes(t))) {
      results.push({ kind: "category", category, score: SCORE.category });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
