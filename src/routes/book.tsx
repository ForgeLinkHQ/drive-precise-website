import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, MapPin } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { TechManBooking } from "@/components/site/techman-booking";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { pageMeta } from "@/lib/seo";
import { checkCoverage, type AreaCoverage } from "@/lib/business";
import { trackEvent } from "@/lib/analytics";
import { techmanBookingConfigured } from "@/lib/techman";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () =>
    pageMeta({
      title: "Book online | Drive Precise",
      description:
        "Book a fixed-price BMW service or repair online. We come to you across Surrey and Hampshire.",
      path: "/book",
    }),
  component: BookPage,
});

/**
 * Online booking (§28).
 *
 * The other door into the business. `/quote` is for work whose price cannot be
 * known until someone has seen the car — which is most BMW work, and is the
 * whole reason this site is a quote builder rather than a booking form. This
 * page is for the minority of jobs where the price genuinely is fixed and the
 * customer should not have to wait for a human to tell them so.
 *
 * The booking itself belongs to TechMan. It writes into the live diary, so a
 * slot taken here is a real appointment — which is exactly why the coverage
 * check below happens *before* the widget is reachable.
 *
 * ── Why the postcode gate exists ──
 *
 * Drive Precise is mobile. There is no workshop, and a booking is only real if
 * somebody can drive to it. TechMan's labour slots were designed for a garage
 * with bays and it is not confirmed that its booking form asks for a service
 * address at all — so this page asks first, using the same `checkCoverage()`
 * that the quote builder and the service-areas page use. Catching a Manchester
 * postcode here costs one screen; catching it after a slot has been taken costs
 * a phone call, an apology and a hole in the day.
 *
 * An out-of-area answer is a conversation, not a wall. §56 is explicit that
 * travel beyond the core area is discussed rather than promised, so the "we
 * don't usually cover you" branch offers WhatsApp rather than a closed door.
 */
function BookPage() {
  const [postcode, setPostcode] = useState("");
  const [coverage, setCoverage] = useState<AreaCoverage | null>(null);
  const [proceeded, setProceeded] = useState(false);

  useEffect(() => {
    trackEvent("booking_page_view");
  }, []);

  const configured = techmanBookingConfigured();

  const check = () => {
    const result = checkCoverage(postcode);
    setCoverage(result);
    // Core and extended both go through. Extended carries a caveat rather than
    // a refusal, which is what §56 means by not promising past real boundaries.
    if (result.status === "core" || result.status === "extended") setProceeded(true);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Book online"
          title="Book a fixed-price job"
          intro="Pick a job, pick a slot, and it goes straight into the diary. For anything where the price depends on your car, build a quote instead and we'll come back to you with a firm number."
        />

        <div className="shell py-10 lg:py-14">
          {!configured ? (
            <BookingNotAvailable />
          ) : !proceeded ? (
            <div className="max-w-xl">
              <div className="rounded-lg border border-border bg-card p-6 shadow-card">
                <MapPin className="size-6 text-accent" aria-hidden="true" />
                <h2 className="mt-4 font-display text-lg font-semibold">Where is the car?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We come to you, so we need to know we can get there before you pick a time.
                </p>

                <form
                  className="mt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    check();
                  }}
                >
                  <Field
                    label="Postcode"
                    hint="Just the first part is enough, e.g. GU15."
                    error={
                      coverage?.status === "unrecognised"
                        ? "That doesn't look like a UK postcode. Please check it."
                        : undefined
                    }
                  >
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        autoComplete="postal-code"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-base uppercase"
                        placeholder="GU15"
                      />
                    )}
                  </Field>

                  <Button type="submit" className="mt-4" disabled={!postcode.trim()}>
                    Check and continue
                  </Button>
                </form>

                {coverage?.status === "outside" && <OutsideArea />}
              </div>

              <p className="mt-6 text-sm text-muted-foreground">
                Not sure what your car needs?{" "}
                <Link to="/quote" className="underline underline-offset-4">
                  Build a quote instead
                </Link>{" "}
                and we'll work it out with you.
              </p>
            </div>
          ) : (
            <div>
              {coverage?.status === "extended" && coverage.area && (
                <p className="mb-6 max-w-3xl rounded-lg border border-status-monitor/50 bg-status-monitor-wash px-4 py-3 text-sm">
                  <strong>{coverage.area.name}</strong> is just outside our core area. We do cover
                  it, but travel time can affect what we can offer on a given day — if the slot you
                  want isn't there, message us and we'll sort something out.
                </p>
              )}
              {coverage?.status === "core" && coverage.area && (
                <p className="mb-6 flex max-w-3xl items-center gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 text-status-good" aria-hidden="true" />
                  We cover {coverage.area.name}.
                </p>
              )}

              <TechManBooking />

              <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
                Booking a slot here confirms an appointment at the price shown. If we get to your
                car and find something the booking didn't cover, we'll tell you what it needs and
                what it costs before doing any of it.
              </p>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * What the page says before TechMan is configured.
 *
 * The route ships before the booking system is finished being set up, so this
 * is a real state rather than a defensive branch. It sends people to the quote
 * builder, which works, rather than showing an empty frame.
 */
function BookingNotAvailable() {
  return (
    <div className="max-w-xl rounded-lg border border-border bg-card p-6 shadow-card">
      <AlertTriangle className="size-6 text-accent" aria-hidden="true" />
      <h2 className="mt-4 font-display text-lg font-semibold">Online booking is coming shortly</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        In the meantime, build your request and we'll confirm a firm price and a date with you
        directly. It usually takes us less than a working day.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/quote">Build your quote</Link>
        </Button>
        <WhatsAppButton context="booking a job" source="book-unconfigured" />
      </div>
    </div>
  );
}

function OutsideArea() {
  return (
    <div
      role="status"
      className={cn(
        "mt-5 rounded-lg border border-status-monitor/50 bg-status-monitor-wash px-4 py-3 text-sm",
      )}
    >
      <p>That's outside the area we normally cover, so we can't promise a slot online.</p>
      <p className="mt-2">
        It is worth asking anyway — we travel further for bigger jobs and for regular customers, and
        we'd rather tell you yes or no than have you guess.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <WhatsAppButton context="a job outside your usual area" source="book-outside-area" />
        <Button asChild variant="outline" size="sm">
          <Link to="/service-areas">See where we cover</Link>
        </Button>
      </div>
    </div>
  );
}
