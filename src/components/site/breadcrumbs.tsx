import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Breadcrumbs.
 *
 * Two jobs, and the second is the one worth building for. The obvious one is
 * orientation on a site with twenty-six pages. The other is that a customer
 * who arrives on a single service page from Google has no idea what else Drive
 * Precise does — the trail back up to the category and the services index is
 * often the first thing they click.
 *
 * `Crumb` is a discriminated shape rather than a bare href because the router
 * types `to` against the generated route tree; a string built by concatenation
 * defeats that and lets a renamed route ship as a dead link.
 */

export type Crumb =
  | { label: string; to: "/services" }
  | { label: string; to: "/services/$category"; params: { category: string } }
  | { label: string; to: "/checks" | "/packages" | "/modifications" | "/return-to-standard" };

export function Breadcrumbs({ trail, current }: { trail: Crumb[]; current: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {trail.map((crumb) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            {crumb.to === "/services/$category" ? (
              <Link
                to={crumb.to}
                params={crumb.params}
                className="underline-offset-4 hover:text-accent hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <Link to={crumb.to} className="underline-offset-4 hover:text-accent hover:underline">
                {crumb.label}
              </Link>
            )}
            <ChevronRight className="size-3.5 opacity-50" aria-hidden="true" />
          </li>
        ))}
        <li aria-current="page" className="text-foreground">
          {current}
        </li>
      </ol>
    </nav>
  );
}
