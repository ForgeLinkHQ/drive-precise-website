import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";
import { BUSINESS, SERVICE_AREAS } from "@/lib/business";
import { mailtoHref, telHref } from "@/lib/contact-links";

export const Route = createFileRoute("/contact")({
  head: () =>
    pageMeta({
      title: "Contact Drive Precise | Mobile BMW Specialist",
      description:
        "Phone, WhatsApp or email. Covering Camberley, Woking, Guildford, Farnham, Farnborough and across Surrey.",
      path: "/contact",
    }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Contact"
          title="Get hold of us"
          intro="WhatsApp is usually fastest. You can send photos and a video of the noise, which is worth a great deal more than trying to describe it."
        />

        <div className="shell py-10 lg:py-14">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <MessageCircle className="size-6 text-accent" aria-hidden="true" />
              <h2 className="mt-4 font-display text-lg font-semibold">WhatsApp</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Send photos, a video, or your MOT failure sheet. Usually answered the same day.
              </p>
              <div className="mt-4">
                <WhatsAppButton block source="contact-page" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <Phone className="size-6 text-accent" aria-hidden="true" />
              <h2 className="mt-4 font-display text-lg font-semibold">Phone</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                If we don't answer we're under a car. Leave a message and we'll ring back.
              </p>
              <Button asChild block variant="outline" className="mt-4">
                <a href={telHref(BUSINESS.phone)}>{BUSINESS.phoneDisplay}</a>
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <Mail className="size-6 text-accent" aria-hidden="true" />
              <h2 className="mt-4 font-display text-lg font-semibold">Email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                For anything that needs a paper trail: invoices, trade arrangements, fleet work.
              </p>
              <Button asChild block variant="outline" className="mt-4">
                <a href={mailtoHref(BUSINESS.email)} className="break-all">
                  {BUSINESS.email}
                </a>
              </Button>
            </div>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="hours-heading">
              <h2 id="hours-heading" className="font-display text-2xl">
                When we work
              </h2>
              <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
                {BUSINESS.hours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-4 px-5 py-3.5">
                    <dt className="font-medium">{row.days}</dt>
                    <dd className="text-muted-foreground">{row.hours}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                Messages sent outside these hours get picked up the next working morning.
              </p>
            </section>

            <section aria-labelledby="where-heading">
              <h2 id="where-heading" className="font-display text-2xl">
                Where we come to
              </h2>
              <p className="mt-4 text-muted-foreground">
                {SERVICE_AREAS.filter((a) => a.tier === "core")
                  .map((a) => a.name)
                  .join(", ")}{" "}
                and the surrounding area, with wider coverage depending on the job.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/service-areas">Check your postcode</Link>
              </Button>

              {/* §55: no fake workshop address, and no implication that anyone
                  can turn up. This paragraph exists specifically to prevent
                  that misunderstanding. */}
              <div className="mt-8 rounded-lg border border-border bg-secondary/50 p-5">
                <h3 className="font-medium">We come to you, and there's no reception to visit</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Drive Precise is a mobile operation. We don't have a customer-facing premises, so
                  everything is arranged in advance and we come to wherever the car is. Where a job
                  needs a workshop, we collect the car and coordinate the facility ourselves.
                </p>
              </div>
            </section>
          </div>

          <section className="mt-14 rounded-lg bg-primary p-8 text-primary-foreground lg:p-10">
            <h2 className="font-display text-2xl text-primary-foreground">
              Know roughly what you need?
            </h2>
            <p className="mt-3 max-w-2xl text-primary-foreground/80">
              Build a request instead. It takes a couple of minutes and means we can come back with
              an actual price rather than a conversation about what you might want.
            </p>
            <Button asChild size="lg" variant="accent" className="mt-6">
              <Link to="/quote">Build a quote</Link>
            </Button>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
