import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/legal-page";
import { pageMeta } from "@/lib/seo";
import { BUSINESS } from "@/lib/business";

export const Route = createFileRoute("/legal/terms")({
  head: () =>
    pageMeta({
      title: "Terms & Conditions — Drive Precise",
      description: "The terms on which Drive Precise Ltd carries out work.",
      path: "/legal/terms",
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro={`The basis on which ${BUSINESS.legalName} carries out work.`}
      updated="August 2026"
    >
      <h2>1. Who these terms are between</h2>
      <p>
        These terms apply between {BUSINESS.legalName} ("we", "us") and you, the customer, whenever
        we carry out work on a vehicle for you. Separate terms apply to trade and business
        customers, agreed directly.
      </p>

      <h2>2. Quotes and prices</h2>
      <p>
        A request built on this website is a request for a quote. It is not a booking, it does not
        commit you to anything, and no charge arises from it.
      </p>
      <p>
        Prices shown as "from" are indicative. A binding price exists only once we have confirmed a
        figure for your specific vehicle and you have accepted it. Full detail is on our{" "}
        <Link to="/legal/pricing" className="text-accent underline underline-offset-4">
          pricing page
        </Link>
        .
      </p>
      <p>
        Quotes are valid for 30 days. Where parts prices move significantly within that period we
        will tell you before proceeding rather than adjusting an invoice afterwards.
      </p>

      <h2>3. Additional work</h2>
      <p>
        If we find work beyond what was quoted, we will contact you, explain what we've found and
        why, and quote for it. We will not carry out unquoted work without your agreement. If we
        cannot reach you, we will stop and leave the vehicle in a safe condition.
      </p>

      <h2>4. Where the work happens</h2>
      <p>
        Mobile work requires a location that is safe, legal and suitable — reasonably level ground,
        enough room to work around the vehicle, and permission from whoever controls the land. If we
        arrive and the location isn't suitable, we'll work with you to find an alternative or
        rearrange. We reserve the right to decline to work in conditions we consider unsafe.
      </p>
      <p>
        Some work requires a ramp or equipment we cannot bring to you. Where that's the case we will
        say so before booking, and can arrange collection and workshop-supported repair instead.
      </p>

      <h2>5. Access and keys</h2>
      <p>
        You must be able to give us access to the vehicle at the agreed time, including keys and any
        security codes required. For collection, you must be entitled to authorise us to drive the
        vehicle, and the vehicle must be taxed, insured and roadworthy for the journey unless we've
        agreed transport instead.
      </p>

      <h2>6. Parts</h2>
      <p>
        Parts we supply carry the manufacturer's warranty, and we will handle any claim under it on
        your behalf. Parts you supply are your responsibility: we'll fit them with reasonable skill
        and care, but we're not liable if the part is incorrect, faulty, or fails afterwards. If a
        supplied part turns out to be wrong, the labour already spent is still chargeable.
      </p>

      <h2>7. Our work</h2>
      <p>
        We carry out work with reasonable skill and care, as required by the Consumer Rights Act
        2015. If something we've done is defective, tell us and we will put it right. Nothing in
        these terms limits your statutory rights.
      </p>

      <h2>8. Inspections and reports</h2>
      <p>
        An inspection reports what could reasonably be established at the time, by the methods
        described for that inspection. It is not a warranty against future faults, and it cannot
        cover what is not visible or accessible without dismantling. Pre-purchase inspections in
        particular are a snapshot of a vehicle on one day — a useful and honest one, but a snapshot.
      </p>

      <h2>9. Partner services</h2>
      <p>
        Where we arrange tyres, alignment, MOT testing, bodywork, glass or other specialist work, it
        is carried out by independent businesses under their own terms. We'll tell you who is doing
        it. Our responsibility is limited to arranging it with reasonable care; the work itself is a
        matter between you and that business.
      </p>

      <h2>10. Payment</h2>
      <p>
        Payment is due on completion unless agreed otherwise. Where parts must be ordered
        specifically for your vehicle, we may require payment for those in advance. We accept bank
        transfer and card.
      </p>

      <h2>11. Cancellation</h2>
      <p>
        See our{" "}
        <Link to="/legal/booking" className="text-accent underline underline-offset-4">
          booking and cancellation policy
        </Link>
        , which forms part of these terms.
      </p>

      <h2>12. Liability</h2>
      <p>
        We maintain insurance appropriate to the work we carry out. We do not exclude or limit
        liability for death or personal injury caused by our negligence, for fraud, or for anything
        else that cannot lawfully be excluded. Beyond that, our liability in connection with any job
        is limited to the value of that job, and we are not liable for indirect or consequential
        losses.
      </p>

      <h2>13. No affiliation with BMW</h2>
      <p>
        {BUSINESS.legalName} is an independent business. We are not affiliated with, authorised by,
        appointed by or endorsed by BMW AG, BMW (UK) Ltd or any part of the BMW group. BMW is our
        area of specialism. All trade marks referred to belong to their respective owners and are
        used only to describe the vehicles we work on.
      </p>

      <h2>14. Governing law</h2>
      <p>
        These terms are governed by the law of England and Wales, and disputes are subject to the
        courts of England and Wales.
      </p>
    </LegalPage>
  );
}
