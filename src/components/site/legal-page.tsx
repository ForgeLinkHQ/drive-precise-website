import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { BUSINESS, configurationIssues } from "@/lib/business";

/**
 * Shared shell for the legal pages (§48).
 *
 * The brief says: "Do not invent legal wording that requires professional legal
 * review; flag configurable legal sections." So every one of these pages is
 * written as a plain, accurate description of how Drive Precise actually
 * operates — which is genuinely useful to a customer and genuinely true — and
 * carries the notice below saying it has not been reviewed by a solicitor.
 *
 * That notice is not decoration. Consumer contract terms, cancellation rights
 * and a privacy notice all have statutory content requirements in the UK, and
 * getting them wrong is a real liability. The right thing for this codebase to
 * do is produce an honest draft and be loud about its status, not to pass off
 * generated boilerplate as legal advice.
 */
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  /** When the wording was last changed. */
  updated: string;
  children: ReactNode;
}) {
  const unconfigured = configurationIssues();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader eyebrow="Legal" title={title} intro={intro} />

        <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8 lg:py-14">
          <div
            role="note"
            className="rounded-lg border border-status-monitor/50 bg-status-monitor/8 p-5"
          >
            <p className="font-medium">Draft — awaiting professional review</p>
            <p className="mt-2 text-sm leading-relaxed">
              This wording describes how {BUSINESS.legalName} actually works and is written to be
              accurate, but it has not been reviewed by a solicitor. It must be checked against UK
              consumer law before this site goes live, and replaced with reviewed wording where
              required.
            </p>
            {unconfigured.length > 0 && (
              <p className="mt-2 text-sm leading-relaxed">
                Company details on this site are also still unconfigured, which a UK limited company
                is required to publish.
              </p>
            )}
          </div>

          <p className="mt-8 text-sm text-muted-foreground">Last updated: {updated}</p>

          {/* Long-form legal text at a comfortable measure. `prose`-style
              spacing is applied here rather than per element so every legal
              page reads identically. */}
          <div className="mt-6 space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
