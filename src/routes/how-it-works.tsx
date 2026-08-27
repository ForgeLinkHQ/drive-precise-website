import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/how-it-works")({
  head: () =>
    pageMeta({
      title: "How It Works: Mobile BMW Servicing | Drive Precise",
      description:
        "From quote to invoice: how a Drive Precise job actually runs. Build a request, get a vehicle-specific price on WhatsApp, we come to you, you get written findings and a proper invoice.",
      path: "/how-it-works",
    }),
  component: HowItWorksPage,
});

/** The customer lifecycle (§61), written from the customer's side. */
const STEPS = [
  {
    n: "01",
    title: "Tell us about the car",
    body: "Registration and rough mileage. That's enough for us to work out what parts your car takes, which is what makes a price accurate rather than a guess.",
  },
  {
    n: "02",
    title: "Choose what you'd like doing",
    body: "Pick from the list, or start from what the car is actually doing if you're not sure. You'll see indicative prices as you go, and you can change your mind at any point.",
  },
  {
    n: "03",
    title: "We confirm the real price",
    body: 'Usually on WhatsApp, usually the same day. This is where a "from" price becomes a firm one, for your car, with the parts it actually needs. We send it over as an estimate you can read, approve and pay online in your own time. Nothing is booked until you do.',
  },
  {
    n: "04",
    title: "We come to you",
    body: "Home, work, wherever the car sits, as long as it's safe and suitable for the job. If it needs a ramp, we'll have told you at step three and arranged collection.",
  },
  {
    n: "05",
    title: "You see what we found",
    body: "Written findings marked green, amber or red, with the measurements. If something can wait, we say so. If something's fine, we say that too.",
  },
  {
    n: "06",
    title: "You decide what happens next",
    body: "Nothing extra gets done without you saying so. We quote for anything we've found, you choose, and the invoice matches what was agreed.",
  },
];

const ANSWERS = [
  {
    q: "Can I just book something without waiting for a quote?",
    a: "For jobs with a genuinely fixed price, yes — pick a time on the booking page and it goes straight into the diary at the price shown. Anything where the cost depends on what your particular car needs goes through a quote first, because we would rather not confirm a price we might then have to change.",
  },
  {
    q: "What if the job turns out to need a ramp?",
    a: "We'll tell you before you commit. Where it does, we can collect the car, get the work done with the right equipment and bring it back.",
  },
  {
    q: "What if you find something else while you're there?",
    a: "We tell you, show you why, and quote for it. We don't do work you haven't agreed to, and we don't add things to an invoice that weren't discussed.",
  },
  {
    q: "What if I'd rather not go ahead?",
    a: "Then don't. A quote request isn't a booking and it costs you nothing. There's no follow-up sales call.",
  },
  {
    q: "What about tyres, alignment or an MOT?",
    a: "We don't do those ourselves, but we work with local specialists and can arrange them as part of the same job so you're not making three separate arrangements.",
  },
];

function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="How it works"
          title="From a question to a finished job"
          intro="No mystery, no waiting by the phone, no invoice that doesn't match the conversation."
        />

        <div className="shell py-10 lg:py-14">
          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-lg border border-border bg-card p-6 shadow-card">
                <p className="font-display text-3xl font-bold text-accent/30">{step.n}</p>
                <h2 className="mt-3 font-display text-xl font-semibold">{step.title}</h2>
                <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>

          <section className="mt-16" aria-labelledby="answers-heading">
            <h2 id="answers-heading" className="font-display text-2xl md:text-3xl">
              The questions people actually ask
            </h2>
            <dl className="mt-6 divide-y divide-border rounded-lg border border-border">
              {ANSWERS.map((item) => (
                <div key={item.q} className="px-6 py-5">
                  <dt className="font-medium">{item.q}</dt>
                  <dd className="mt-2 text-muted-foreground">{item.a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4">
              <Link to="/faq" className="text-accent underline underline-offset-4">
                More questions and answers
              </Link>
            </p>
          </section>

          <section className="mt-16 rounded-lg bg-primary p-8 text-primary-foreground lg:p-10">
            <h2 className="font-display text-2xl text-primary-foreground md:text-3xl">
              Ready when you are
            </h2>
            <p className="mt-3 max-w-2xl text-primary-foreground/80">
              Building a request takes a couple of minutes and commits you to nothing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent">
                <Link to="/quote">Build a quote</Link>
              </Button>
              <WhatsAppButton size="lg" label="Just ask us" source="how-it-works" />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
