import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { SYMPTOM_OPTIONS, type SymptomOption } from "@/lib/symptoms";
import { trackEvent } from "@/lib/analytics";

/**
 * "What does your car need?" (§7).
 *
 * Rendered as a list of plain sentences rather than a grid of icons, because
 * the audience for this section is specifically the person who does not know
 * the vocabulary (§3) — and an icon of a suspension arm helps only the people
 * who did not need the section in the first place.
 *
 * The note underneath is not boilerplate. §7 says this must not attempt to
 * diagnose, and telling the customer that plainly is what stops them reading
 * "It makes a strange noise → Suspension & Handling Check" as a diagnosis.
 */
export function SymptomRouter() {
  return (
    <section aria-labelledby="symptom-heading">
      <h2 id="symptom-heading" className="font-display text-3xl md:text-4xl">
        What does your car need?
      </h2>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        You don't need to know what the part is called. Pick whichever of these sounds most like
        your car and we'll point you at the right next step.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SYMPTOM_OPTIONS.map((option) => (
          <li key={option.id}>
            <SymptomLink option={option}>
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{option.helper}</span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground group-hover:text-accent"
                aria-hidden="true"
              />
            </SymptomLink>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
        This points you towards the right check — it isn't a diagnosis. What's actually wrong gets
        worked out when someone looks at the car.
      </p>
    </section>
  );
}

const LINK_CLASS =
  "card-lift group flex min-h-[76px] w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left shadow-card hover:border-accent";

/**
 * One option, as a typed router link.
 *
 * A switch rather than a `to={someString}`: the router's `Link` types `to`
 * against the generated route tree, and a path built by string concatenation
 * defeats that entirely. Spelling each destination out means a renamed route
 * breaks the build instead of shipping a dead entry on the homepage.
 */
function SymptomLink({ option, children }: { option: SymptomOption; children: ReactNode }) {
  const onClick = () => trackEvent("symptom_selected", { meta: { symptom: option.id } });

  switch (option.target.kind) {
    case "service":
      return (
        <Link
          to="/quote"
          search={{ add: option.target.serviceId }}
          onClick={onClick}
          className={LINK_CLASS}
        >
          {children}
        </Link>
      );
    case "package":
      return (
        <Link
          to="/quote"
          search={{ package: option.target.packageId }}
          onClick={onClick}
          className={LINK_CLASS}
        >
          {children}
        </Link>
      );
    case "category":
      return (
        <Link
          to="/services/$category"
          params={{ category: option.target.categorySlug }}
          onClick={onClick}
          className={LINK_CLASS}
        >
          {children}
        </Link>
      );
    case "page":
      return (
        <Link to={option.target.to} onClick={onClick} className={LINK_CLASS}>
          {children}
        </Link>
      );
  }
}
