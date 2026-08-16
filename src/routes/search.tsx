import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { ServiceCard } from "@/components/site/service-card";
import { PriceBadge } from "@/components/site/price-badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import { searchCatalogue } from "@/lib/search";
import { CATEGORY_BLURB, CATEGORY_LABEL, CATEGORY_SLUG } from "@/lib/services";
import { trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () =>
    pageMeta({
      title: "Search services — Drive Precise",
      description: "Find the right service. Try 'brakes', 'knocking', 'pothole' or 'smell'.",
      path: "/search",
      // A search results page has nothing unique to offer an index, and
      // letting one get crawled is how you end up with a thousand thin pages
      // (§36 warns about exactly that).
      noIndex: true,
    }),
  component: SearchPage,
});

/** Example queries, chosen to show it understands symptoms as well as parts. */
const EXAMPLES = ["brakes", "knocking", "pothole", "smell", "service", "just bought"];

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const { services } = useCatalogue();
  const [input, setInput] = useState(q ?? "");

  const results = q ? searchCatalogue(q, services) : [];

  const runSearch = (value: string) => {
    const trimmed = value.trim();
    void navigate({ search: trimmed ? { q: trimmed } : {} });
    if (trimmed) trackEvent("search_performed", { meta: { query: trimmed.slice(0, 60) } });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Search"
          title="What are you after?"
          intro="Search by the job, or by what the car is doing. You don't need the right word for it."
        />

        <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8 lg:py-14">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(input);
            }}
          >
            <Field label="Search services" hint="Try a part, a job, or the noise it makes.">
              {(props) => (
                <div className="flex gap-2">
                  <Input
                    {...props}
                    type="search"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="brakes, knocking, pothole…"
                  />
                  <Button type="submit" size="md" aria-label="Search">
                    <SearchIcon className="size-5" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </Field>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setInput(example);
                  runSearch(example);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
              >
                {example}
              </button>
            ))}
          </div>

          {q && (
            <div className="mt-10">
              <h2 className="font-display text-xl">
                {results.length === 0
                  ? `Nothing matched "${q}"`
                  : `${results.length} result${results.length === 1 ? "" : "s"} for "${q}"`}
              </h2>

              {results.length === 0 ? (
                <p className="mt-3 text-muted-foreground">
                  Search only looks through the things we list — it isn't a diagnosis tool. If the
                  car is doing something odd, message us and describe it in your own words. That
                  works better than any search box.
                </p>
              ) : (
                <div className="mt-6 space-y-4">
                  {results.map((result) => {
                    if (result.kind === "service") {
                      return <ServiceCard key={result.service.id} service={result.service} />;
                    }
                    if (result.kind === "package") {
                      return (
                        <Link
                          key={result.pkg.id}
                          to="/quote"
                          search={{ package: result.pkg.id }}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 hover:border-accent"
                        >
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-accent">
                              Package
                            </p>
                            <h3 className="mt-1 font-display text-lg font-semibold">
                              {result.pkg.name}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {result.pkg.shortDescription}
                            </p>
                          </div>
                          <PriceBadge
                            pricing={result.pkg.pricing}
                            priceGbp={result.pkg.priceGbp}
                            size="sm"
                          />
                        </Link>
                      );
                    }
                    return (
                      <Link
                        key={result.category}
                        to="/services/$category"
                        params={{ category: CATEGORY_SLUG[result.category] }}
                        className="block rounded-lg border border-border bg-card p-5 hover:border-accent"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-accent">
                          Section
                        </p>
                        <h3 className="mt-1 font-display text-lg font-semibold">
                          {CATEGORY_LABEL[result.category]}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {CATEGORY_BLURB[result.category]}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
