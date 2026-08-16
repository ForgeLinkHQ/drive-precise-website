import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { pageMeta } from "@/lib/seo";
import { SERVICE_AREAS, checkCoverage, type AreaCoverage } from "@/lib/business";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/service-areas")({
  head: () =>
    pageMeta({
      title: "Service Areas — Mobile BMW Specialist in Hampshire & Surrey | Drive Precise",
      description:
        "We cover Farnborough, Camberley, Aldershot, Fleet, Farnham, Guildford, Woking, Basingstoke, Bracknell and Reading. Check your postcode.",
      path: "/service-areas",
    }),
  component: ServiceAreasPage,
});

function ServiceAreasPage() {
  const [postcode, setPostcode] = useState("");
  const [result, setResult] = useState<AreaCoverage | null>(null);

  const core = SERVICE_AREAS.filter((a) => a.tier === "core");
  const extended = SERVICE_AREAS.filter((a) => a.tier === "extended");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Service areas"
          title="Where we come to"
          intro="Hampshire, Surrey and the Berkshire border. Beyond that it depends on the job — a full day's work is worth travelling for in a way that a half-hour one isn't, and we'll tell you honestly which yours is."
        />

        <div className="shell py-10 lg:py-14">
          <section className="max-w-xl" aria-labelledby="check-heading">
            <h2 id="check-heading" className="font-display text-2xl">
              Check your postcode
            </h2>
            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                setResult(checkCoverage(postcode));
              }}
            >
              <Field label="Your postcode" hint="The first part is enough, e.g. GU15.">
                {(props) => (
                  <Input
                    {...props}
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="uppercase"
                    placeholder="GU15"
                  />
                )}
              </Field>
              <Button type="submit" className="mt-4">
                Check
              </Button>
            </form>

            {result && (
              <div
                role="status"
                className={cn(
                  "mt-6 rounded-lg border p-5",
                  result.status === "core" && "border-status-good/50 bg-status-good/8",
                  result.status !== "core" && "border-border bg-secondary",
                )}
              >
                {result.status === "core" && (
                  <>
                    <p className="font-medium">Yes — {result.area.name} is right in our area.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      No travel charge, and usually the quickest to get booked in.
                    </p>
                  </>
                )}
                {result.status === "extended" && (
                  <>
                    <p className="font-medium">Yes, we cover {result.area.name}.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Depending on the job there may be a travel charge. We'll tell you what it is
                      with your quote — before you commit to anything.
                    </p>
                  </>
                )}
                {result.status === "outside" && (
                  <>
                    <p className="font-medium">That's outside our usual patch.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Worth asking anyway. A bigger job can justify the trip where a small one
                      can't, and we'd rather tell you straight than have you guess.
                    </p>
                  </>
                )}
                {result.status === "unrecognised" && (
                  <>
                    <p className="font-medium">We couldn't read that as a postcode.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Try just the first part — the letters and the first number, like GU14.
                    </p>
                  </>
                )}
                <div className="mt-4">
                  <WhatsAppButton
                    context={`work in ${postcode.toUpperCase()}`}
                    label="Ask us"
                    size="sm"
                    source="service-areas"
                  />
                </div>
              </div>
            )}
          </section>

          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <section aria-labelledby="core-heading">
              <h2 id="core-heading" className="font-display text-2xl">
                Core area
              </h2>
              <p className="mt-2 text-muted-foreground">No travel charge.</p>
              <ul className="mt-5 space-y-3">
                {core.map((area) => (
                  <li key={area.name} className="rounded-lg border border-border bg-card px-5 py-4">
                    <p className="font-medium">{area.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {area.outwardCodes.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="extended-heading">
              <h2 id="extended-heading" className="font-display text-2xl">
                Also covered
              </h2>
              <p className="mt-2 text-muted-foreground">
                A travel charge may apply depending on the work.
              </p>
              <ul className="mt-5 space-y-3">
                {extended.map((area) => (
                  <li key={area.name} className="rounded-lg border border-border bg-card px-5 py-4">
                    <p className="font-medium">{area.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {area.outwardCodes.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-14 rounded-lg border border-border bg-secondary/50 p-6 lg:p-8">
            <h2 className="font-display text-xl font-semibold">Not near us but want the work?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Collection and return covers more ground than a mobile visit does — we can pick the
              car up from further out, do the work, and bring it back. Ask and we'll tell you what
              that would look like.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/quote">Build a quote</Link>
            </Button>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
