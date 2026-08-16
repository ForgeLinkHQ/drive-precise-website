import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/legal-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/legal/pricing")({
  head: () =>
    pageMeta({
      title: "How our pricing works — Drive Precise",
      description:
        "Fixed prices, 'from' prices and vehicle-specific quotes explained, plus how partner services are charged.",
      path: "/legal/pricing",
    }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <LegalPage
      title="How our pricing works"
      intro="Three kinds of price appear on this site. Here's exactly what each one means."
      updated="August 2026"
    >
      <h2>Fixed prices</h2>
      <p>
        Shown as a plain figure, for example <strong>£59</strong>. These are jobs where the work is
        effectively the same on every car we'd do it on, so we can commit to the price before seeing
        the vehicle. Health checks and most inspections fall into this group. If we quote you a
        fixed price, that is what you pay for that item.
      </p>

      <h2>"From" prices</h2>
      <p>
        Shown as <strong>From £149</strong>. These are jobs where the labour is predictable but the
        parts are not. BMW parts prices vary a great deal between models, engines and trim levels —
        the same service on two cars that look identical from the outside can differ by a
        substantial amount once you know which engine is in them.
      </p>
      <p>
        A "from" price is the genuine starting point for that job, not a headline designed to get
        you through the door. We confirm the actual figure for your specific vehicle before anything
        is booked, and you are free to decline at that point with nothing owed.
      </p>

      <h2>Vehicle-specific quotes</h2>
      <p>
        Shown as <strong>Vehicle-specific quote</strong>. These are jobs where we cannot honestly
        put a number on it in advance — a leak that needs finding, a repair where the parts depend
        entirely on what we discover, or work on braking or suspension systems that vary enormously
        across models.
      </p>
      <p>
        Quoting a number here and then revising it upward is a practice we're not willing to adopt,
        so we don't put one up at all. Tell us the registration and what the car is doing, and we'll
        come back with a real figure.
      </p>

      <h2>What the basket total means</h2>
      <p>
        The figure shown while you build a request is labelled an <em>estimate</em>, and it is
        calculated only from items that have a price. Anything marked as a vehicle-specific quote is
        counted separately and is not included in that number — so the total never implies that a
        variable repair is covered by it.
      </p>

      <h2>Additional work found during a job</h2>
      <p>
        If we find something while we're working on your car, we tell you, show you why, and quote
        for it. We do not carry out work you haven't agreed to, and nothing appears on an invoice
        that wasn't discussed with you first.
      </p>

      <h2>Travel</h2>
      <p>
        There is no travel charge within our core service area. Beyond it, a travel charge may apply
        depending on the distance and the size of the job. Where one applies, it is included in the
        quote you're given before booking — never added afterwards.{" "}
        <Link to="/service-areas" className="text-accent underline underline-offset-4">
          Check your postcode
        </Link>
        .
      </p>

      <h2>Parts you supply yourself</h2>
      <p>
        For a lot of work — modifications especially — you're welcome to supply your own parts, and
        we'll quote for labour only. The part itself is then your responsibility: if it is the wrong
        one, faulty, or fails later, that sits with you and your supplier. Our labour is our
        responsibility either way. For some jobs we'd rather supply the parts so we can stand behind
        the whole thing, and we'll say so before you commit.
      </p>

      <h2>Partner services</h2>
      <p>
        Where your car needs work we don't do ourselves — tyres, alignment, MOT testing, bodywork,
        glass — we can arrange it through independent local specialists. That work is carried out
        and charged by those businesses under their own terms, and we'll tell you who is doing it
        before anything is booked.
      </p>

      <h2>Payment</h2>
      <p>
        Payment is due on completion, by bank transfer or card. There is no deposit for standard
        work. Where a job requires expensive parts ordered specifically for your vehicle, we may ask
        for those in advance — we will always tell you before you commit.
      </p>
    </LegalPage>
  );
}
