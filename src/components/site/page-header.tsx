import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The band at the top of every interior page.
 *
 * `h1` lives here, so each page has exactly one and it is always the page's
 * actual subject. Making it a component rather than a convention is what stops
 * a page shipping with two h1s or none — the most common heading bug on a site
 * with twenty-six pages.
 *
 * `tone="deep"` puts the header on the dark band. Reserved for the pages that
 * are selling rather than informing — trade, and the two modification pages —
 * so the weight means something instead of being applied everywhere until it
 * stops registering.
 */
export function PageHeader({
  eyebrow,
  title,
  intro,
  breadcrumbs,
  tone = "light",
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  breadcrumbs?: ReactNode;
  tone?: "light" | "deep";
  children?: ReactNode;
}) {
  const deep = tone === "deep";

  return (
    <div className={cn(deep ? "band-deep on-deep" : "border-b border-border bg-secondary/50")}>
      <div className="shell py-10 lg:py-14">
        {breadcrumbs && <div className="mb-6">{breadcrumbs}</div>}
        {eyebrow && <p className={cn("eyebrow", deep && "text-accent")}>{eyebrow}</p>}
        <h1 className="mt-3 max-w-3xl text-4xl md:text-5xl">{title}</h1>
        {intro && (
          <p
            className={cn(
              "mt-5 max-w-2xl text-lg leading-relaxed",
              deep ? "muted-on-deep" : "text-muted-foreground",
            )}
          >
            {intro}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </div>
  );
}
