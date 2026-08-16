import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/legal-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/legal/booking")({
  head: () =>
    pageMeta({
      title: "Booking & Cancellation Policy — Drive Precise",
      description:
        "How a booking is made, how to change or cancel it, and what happens if we can't complete the work.",
      path: "/legal/booking",
    }),
  component: BookingPage,
});

function BookingPage() {
  return (
    <LegalPage
      title="Booking & Cancellation"
      intro="How a booking is actually made, and what happens when plans change on either side."
      updated="August 2026"
    >
      <h2>When a booking exists</h2>
      <p>
        A request built on this website is not a booking. Neither is a preferred date you've told us
        about. A booking exists only when we have confirmed a specific date and time with you, and
        you have accepted the quoted price.
      </p>
      <p>
        We say this plainly because the opposite assumption causes real problems — nobody should
        take a morning off work on the strength of a form submission.
      </p>

      <h2>Changing or cancelling</h2>
      <p>
        Tell us as early as you can and we'll rearrange without fuss. There is no cancellation
        charge for standard work cancelled with at least 24 hours' notice.
      </p>
      <p>
        Where we've ordered parts specifically for your vehicle, those may not be returnable. If you
        cancel after we've ordered them, we may charge for the parts — we'll tell you before
        ordering anything that falls into this category, so it can't come as a surprise.
      </p>

      <h2>If we can't get to you</h2>
      <p>
        Occasionally a job overruns, a vehicle breaks down, or the weather makes outdoor work unsafe
        or impossible. We'll tell you as soon as we know, and rearrange at a time that suits you.
        You will not be charged for an appointment we could not attend.
      </p>

      <h2>If the location turns out to be unsuitable</h2>
      <p>
        Mobile work needs safe, level ground with enough space to work around the vehicle, and the
        permission of whoever controls the land. If we arrive and it isn't workable, we'll try to
        find an alternative on the spot — a nearby car park, a different bay — or rearrange.
      </p>
      <p>
        Where we've travelled to a location that was described to us as suitable and clearly isn't,
        we may charge a call-out fee to cover the trip. In practice this is rare and we'd usually
        rather sort out the problem.
      </p>

      <h2>If the vehicle isn't as described</h2>
      <p>
        If the car turns out to need different parts or substantially more work than the quote
        assumed, we'll stop and re-quote before continuing. You can decline, and you'll only be
        charged for work already carried out at that point.
      </p>

      <h2>Weather</h2>
      <p>
        We work outdoors much of the time. Light rain is usually fine; heavy rain, ice or high winds
        can make certain jobs unsafe or bad for the quality of the work. Where that's the case we'll
        rearrange rather than do a poor job, and there's no charge for that.
      </p>

      <h2>Your right to cancel a distance contract</h2>
      <p>
        Where you agree to work with us without meeting us in person, the Consumer Contracts
        Regulations 2013 generally give you 14 days to cancel. If you ask us to start work within
        that period, you may be charged for what we've done up to the point you cancel. We'll make
        this clear when we confirm a booking.
      </p>
    </LegalPage>
  );
}
