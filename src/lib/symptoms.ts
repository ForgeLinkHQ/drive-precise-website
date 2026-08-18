/**
 * "What does your car need?" — the symptom router (§7).
 *
 * This is a routing interface, not a diagnosis engine. The distinction is the
 * whole point of the section and it is a safety property, not a disclaimer:
 * nothing here decides what is wrong with anyone's car. Each option maps a
 * sentence a customer can say out loud onto the service or page that is the
 * right next step, and the site then says "here is what this check covers"
 * rather than "your drop links have failed".
 *
 * The wording matters as much as the mapping. "It makes a strange noise" has
 * to be selectable by someone who has never heard the phrase "anti-roll bar
 * drop link" — §3 is explicit that a new driver should be able to use this.
 */

/**
 * Plain pages a symptom may route to.
 *
 * A literal union rather than `string`, so the router's typed `Link` can check
 * these against the real route tree — a renamed page then breaks the build
 * instead of shipping a dead entry on the homepage.
 */
export type SymptomPage = "/modifications" | "/return-to-standard" | "/quote";

export interface SymptomOption {
  id: string;
  /** What the customer says. First person, plain English. */
  label: string;
  /** A line of reassurance or clarification under the label. */
  helper: string;
  /**
   * Where it goes. Either a service to preselect in the builder, a package,
   * or a plain page when no single service is the right answer.
   */
  target:
    | { kind: "service"; serviceId: string }
    | { kind: "package"; packageId: string }
    | { kind: "category"; categorySlug: string }
    | { kind: "page"; to: SymptomPage };
}

export const SYMPTOM_OPTIONS: SymptomOption[] = [
  {
    id: "needs-a-service",
    label: "It needs a service",
    helper: "Due one, or the dashboard is asking.",
    target: { kind: "category", categorySlug: "servicing" },
  },
  {
    id: "brakes",
    label: "The brakes need attention",
    helper: "Squealing, grinding, or the warning light is on.",
    target: { kind: "service", serviceId: "brake-health-check" },
  },
  {
    id: "strange-noise",
    label: "It makes a strange noise",
    helper: "You don't need to know what it is. We'll find it.",
    target: { kind: "service", serviceId: "suspension-handling-check" },
  },
  {
    id: "doesnt-feel-right",
    label: "Something doesn't feel right",
    helper: "Hard to describe, but it's not how it was.",
    target: { kind: "service", serviceId: "vehicle-health-check" },
  },
  {
    id: "pulls-or-vibrates",
    label: "It pulls or vibrates",
    helper: "Steering wheel shakes, or the car won't hold a straight line.",
    target: { kind: "service", serviceId: "suspension-handling-check" },
  },
  {
    id: "pothole",
    label: "I've hit a pothole",
    helper: "Hard enough to make you wince.",
    target: { kind: "service", serviceId: "pothole-impact-check" },
  },
  {
    id: "long-journey",
    label: "I'm going on a long journey",
    helper: "Holiday, motorway miles, a full car.",
    target: { kind: "package", packageId: "road-trip-ready" },
  },
  {
    id: "just-bought",
    label: "I've just bought the car",
    helper: "Find out what actually needs doing, and what doesn't.",
    target: { kind: "service", serviceId: "new-to-you-check" },
  },
  {
    id: "mot-coming-up",
    label: "My MOT is coming up",
    helper: "Catch the obvious things before the test.",
    target: { kind: "service", serviceId: "pre-mot-check" },
  },
  {
    id: "aircon-smells",
    label: "The air conditioning smells strange",
    helper: "Musty when you first turn the fan on.",
    target: { kind: "package", packageId: "cabin-refresh" },
  },
  {
    id: "want-it-checked",
    label: "I want the car checked",
    helper: "No particular problem. You'd just like to know.",
    target: { kind: "service", serviceId: "vehicle-health-check" },
  },
  {
    id: "mods-fitted",
    label: "I want modifications fitted",
    helper: "Styling, intakes, springs.",
    target: { kind: "page", to: "/modifications" },
  },
  {
    id: "mods-removed",
    label: "I want modifications removed",
    helper: "Back to factory standard, ready to sell or hand back.",
    target: { kind: "page", to: "/return-to-standard" },
  },
  {
    id: "something-else",
    label: "Something else",
    helper: "Tell us what the car is doing in your own words.",
    target: { kind: "page", to: "/quote" },
  },
];

/** The href a symptom option leads to. */
export function symptomHref(option: SymptomOption): string {
  switch (option.target.kind) {
    case "service":
      return `/quote?add=${encodeURIComponent(option.target.serviceId)}`;
    case "package":
      return `/quote?package=${encodeURIComponent(option.target.packageId)}`;
    case "category":
      return `/services/${option.target.categorySlug}`;
    case "page":
      return option.target.to;
  }
}
