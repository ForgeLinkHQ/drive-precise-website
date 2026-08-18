import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/legal-page";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/legal/cookies")({
  head: () =>
    pageMeta({
      title: "Cookie Policy | Drive Precise",
      description:
        "We use no advertising or tracking cookies. Here is exactly what this site stores on your device and why.",
      path: "/legal/cookies",
    }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="Short version: no advertising cookies, no tracking cookies, no third-party pixels. Here's the detail."
      updated="August 2026"
    >
      <h2>What we store on your device</h2>
      <p>Two things, both of them functional, and neither of them a cookie in the usual sense.</p>

      <h3>Your part-built quote</h3>
      <p>
        Stored in your browser's local storage under <code>dp.quote-draft.v1</code>. It holds the
        registration, mileage and services you've chosen, plus anything you typed into the request
        form. It exists so you don't lose your place if you close the tab and come back, and it
        never leaves your device until you press the button to send it to us.
      </p>
      <p>
        You can clear it at any point by clearing site data in your browser, and it is removed
        automatically once you've submitted a request.
      </p>

      <h3>Whether you've dismissed our cookie notice</h3>
      <p>
        Stored as <code>dp.cookie-notice-dismissed.v1</code>. One value, so we don't show you the
        same notice on every page.
      </p>

      <h2>Analytics</h2>
      <p>
        We count page views and how far people get through building a quote. This is done without
        storing anything on your device: a random session identifier is generated in memory when the
        page loads and is gone when you close the tab. It carries no name, no contact details and no
        vehicle registration, and it cannot be used to recognise you on a later visit.
      </p>
      <p>If your browser has "Do Not Track" enabled, we record nothing at all.</p>

      <h2>Why there's no "reject" button</h2>
      <p>
        UK cookie rules require consent for storage that isn't strictly necessary to provide the
        service you asked for. Everything above is either strictly necessary or stored nowhere at
        all, so there is nothing here to consent to, and offering a reject button that changed
        nothing would be misleading rather than helpful.
      </p>
      <p>
        If we ever add advertising or third-party tracking, this page changes and a proper consent
        banner appears with it. That would be a change in what we do, not a change in wording.
      </p>

      <h2>Third parties</h2>
      <p>
        This site loads fonts from Google Fonts, which means your browser makes a request to
        Google's servers. No cookie is set by that request. Our hosting and database providers
        (Vercel and Supabase) do not set advertising cookies.
      </p>
      <p>
        If you choose to message us on WhatsApp, that happens in WhatsApp and is subject to their
        terms, not ours.
      </p>

      <p>
        More on what we do with information you send us is in our{" "}
        <Link to="/legal/privacy" className="text-accent underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </LegalPage>
  );
}
