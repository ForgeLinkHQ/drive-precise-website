import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/legal-page";
import { pageMeta } from "@/lib/seo";
import { BUSINESS } from "@/lib/business";
import { mailtoHref } from "@/lib/contact-links";

export const Route = createFileRoute("/legal/privacy")({
  head: () =>
    pageMeta({
      title: "Privacy Policy — Drive Precise",
      description:
        "What we collect, why we collect it, how long we keep it and what you can ask us to do with it.",
      path: "/legal/privacy",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What we collect, why, and what you can ask us to do about it."
      updated="August 2026"
    >
      <h2>Who we are</h2>
      <p>
        {BUSINESS.legalName} is the data controller for the information described here. You can
        reach us at{" "}
        <a href={mailtoHref(BUSINESS.email)} className="text-accent underline underline-offset-4">
          {BUSINESS.email}
        </a>
        .
      </p>

      <h2>What we collect when you request a quote</h2>
      <ul>
        <li>Your name, mobile number and — if you give it — your email address.</li>
        <li>Your vehicle registration and mileage.</li>
        <li>What work you've asked about, and any notes you've written.</li>
        <li>Your postcode and preferred appointment timing.</li>
        <li>How you found us, if you tell us.</li>
      </ul>
      <p>
        A vehicle registration is personal data under UK GDPR, because it can identify a person via
        the DVLA. We treat it accordingly: it is never sent to our analytics, never used for
        marketing, and never shared except as described below.
      </p>

      <h2>Why we're allowed to hold it</h2>
      <p>
        Our lawful basis is{" "}
        <strong>
          performance of a contract, or steps taken at your request before entering into one
        </strong>
        . You've asked us to quote for work on your car; we cannot do that without knowing what car
        and how to reach you.
      </p>
      <p>
        Where we keep records of completed work, our basis is <strong>legal obligation</strong> (tax
        and accounting records) and <strong>legitimate interests</strong> (maintaining a service
        history for your vehicle, which is genuinely useful to you and to any future owner).
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell your data, ever, to anyone.</li>
        <li>We do not use advertising or tracking cookies.</li>
        <li>We do not add you to a marketing list because you asked for a quote.</li>
        <li>We do not share your details with partners without telling you first.</li>
      </ul>

      <h2>Analytics</h2>
      <p>
        We count how the site is used so we can make it work better. That counting stores nothing on
        your device and holds no identifying information: no name, no number, no registration. A
        random session identifier lives in your browser's memory for as long as the tab is open and
        disappears when you close it. We also respect your browser's "Do Not Track" setting, and
        count nothing at all if it's switched on.
      </p>

      <h2>Who else sees your information</h2>
      <ul>
        <li>
          <strong>Our hosting and database providers.</strong> The site runs on Vercel and stores
          data in Supabase. Both act as processors under contract and neither uses your data for
          their own purposes.
        </li>
        <li>
          <strong>WhatsApp,</strong> if you choose to message us there. That conversation is subject
          to WhatsApp's own privacy terms as well as ours.
        </li>
        <li>
          <strong>Our garage management system,</strong> where a quote becomes an actual job. It
          holds your customer record, vehicle history and invoices.
        </li>
        <li>
          <strong>Partner businesses,</strong> only where you've agreed to us arranging work with
          them, and only the details they need to do it.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Quote requests that don't become jobs:</strong> up to 12 months, then deleted.
        </li>
        <li>
          <strong>Completed job records and invoices:</strong> six years, which is what UK tax law
          requires.
        </li>
        <li>
          <strong>Vehicle service history:</strong> kept while you remain a customer, because it's
          the point of having it.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Under UK GDPR you can ask us for a copy of what we hold about you, ask us to correct
        anything wrong, ask us to delete it (where we're not legally required to keep it), object to
        how we're using it, or ask for it in a portable format. Email us and we'll respond within
        one month.
      </p>
      <p>
        If you're not happy with how we've handled it, you can complain to the Information
        Commissioner's Office at ico.org.uk. We'd rather you told us first so we can put it right.
      </p>

      <h2>Changes</h2>
      <p>
        If we change how we handle your information we'll update this page and change the date at
        the top.
      </p>
    </LegalPage>
  );
}
