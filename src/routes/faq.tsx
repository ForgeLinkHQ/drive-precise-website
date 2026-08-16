import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { pageMeta } from "@/lib/seo";
import { BUSINESS } from "@/lib/business";

export const Route = createFileRoute("/faq")({
  head: () => {
    const meta = pageMeta({
      title: "Questions & Answers — Drive Precise",
      description:
        "Do you come to my home? What if the job needs a ramp? Why does it say 'from'? Can I supply my own parts? Straight answers to what people actually ask.",
      path: "/faq",
    });
    return {
      ...meta,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: { "@type": "Answer", text: faq.a },
            })),
          }),
        },
      ],
    };
  },
  component: FaqPage,
});

/**
 * §54, with the answers written to real operating policy rather than to
 * whatever sounds most accommodating.
 *
 * Two of these say no. That is intentional — a FAQ where every answer is yes is
 * a sales page, and the ones that say no ("we're not an MOT station", "we don't
 * regas air conditioning") are the ones that build the trust §63 is about.
 */
const FAQS = [
  {
    q: "Do you come to my home?",
    a: "Yes, for most jobs. Servicing, brakes, checks and a good deal of repair work happen perfectly well on a driveway. We need somewhere reasonably level and safe to work, and enough room to get around the car.",
  },
  {
    q: "Can you work at my workplace?",
    a: "Yes, as long as whoever owns the car park is happy with it. A lot of our customers get their car serviced while they're at their desk. Check with your facilities team first if you're not sure.",
  },
  {
    q: "What if the job needs a ramp?",
    a: "We'll tell you before you commit to anything. Where a job genuinely needs lifting equipment, we can collect the car, get the work done with the right kit and bring it back to you.",
  },
  {
    q: "Can you collect my vehicle?",
    a: "Yes. Collection and return is available across our service area, priced on distance. It's added to the work you're having done rather than sold on its own.",
  },
  {
    q: "Do you only work on BMWs?",
    a: "BMW is our specialism and it's what we're best at. We do take on other makes — plenty of households have a BMW and something else on the drive — so ask, and we'll tell you straight whether we're the right people for it.",
  },
  {
    q: "Are your prices fixed?",
    a: "Some are. A brake fluid service or a health check is the same job on nearly every car, so that price is what you pay. Anything involving parts that vary by model is shown as a 'from' price, because we can't honestly guarantee a number before we know which parts your car takes.",
  },
  {
    q: 'Why does the site say "from"?',
    a: "Because BMW parts prices vary enormously between models and specifications — the same job on two 3 Series can differ by a hundred pounds depending on the engine and trim. A 'from' price is the honest starting point. We confirm the exact figure for your vehicle before anything is booked, and you're free to walk away at that point.",
  },
  {
    q: "Do I need to know exactly what's wrong?",
    a: "No, and most people don't. Tell us what the car is doing — the noise, when it happens, what it feels like — and we'll work out the rest. There's a whole section on the homepage designed around exactly this.",
  },
  {
    q: "Can you arrange tyres or alignment?",
    a: "We don't fit tyres or do alignment ourselves, but we work with local specialists and can arrange it as part of the same job. We'll tell you who's doing the work before it's booked.",
  },
  {
    q: "Can you help with an MOT failure?",
    a: "Yes. Send us a photo of the failure sheet and we'll quote for putting it right. Most mechanical failures are work we do; anything else we arrange through a partner. We're not an MOT testing station ourselves, though we can arrange the retest.",
  },
  {
    q: "Can you inspect a car before I buy it?",
    a: "Yes — that's the Pre-Purchase Inspection. We look at it properly, road test it where the seller allows, and give you a written report. We'd rather tell you to walk away from a car than watch you buy a bad one.",
  },
  {
    q: "Can I supply my own parts?",
    a: "For a lot of work, yes — especially modifications, where most people have already bought the part. There are jobs where we'd rather supply the parts ourselves so we can stand behind the whole thing, and we'll say so when that applies. Customer-supplied parts are fitted at your risk as far as the part itself goes; our labour is our responsibility either way.",
  },
  {
    q: "Do you do diagnostics?",
    a: "Not at the moment. We're waiting on our own diagnostic equipment, and we'd rather tell you that than half-do it. Mechanical faults we can find by inspection and road test are absolutely something we take on.",
  },
  {
    q: "Can you regas my air conditioning?",
    a: "No. The cabin hygiene treatment we offer deals with the smell, which is what most people are really asking about. Actual refrigerant work needs equipment and certification we don't currently have, and we won't pretend otherwise.",
  },
  {
    q: "How do I get my final quote?",
    a: "Build a request on the site — it takes a couple of minutes — and we'll come back with a firm price for your car, usually on WhatsApp and usually the same day. You can also just message us and skip the form.",
  },
  {
    q: "How does payment work?",
    a: "You pay when the work is done, by bank transfer or card. There's no deposit for standard work. Where a job needs expensive parts ordered in specifically for your car, we may ask for those up front — we'll always say so before you commit.",
  },
];

function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="Questions"
          title="What people actually ask"
          intro="Including the ones where the answer is no."
        />

        <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8 lg:py-14">
          <div className="space-y-3">
            {FAQS.map((faq) => (
              // <details> rather than a JS accordion: it works before hydration,
              // it is keyboard-operable and screen-reader-announced for free,
              // and Ctrl+F finds the text inside a closed one in most browsers.
              <details
                key={faq.q}
                className="group rounded-lg border border-border bg-card px-5 shadow-card transition-colors hover:border-border-strong"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:border-accent group-open:text-accent"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-5 leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>

          <section className="mt-12 rounded-lg border border-border bg-secondary/50 p-6">
            <h2 className="font-display text-xl font-semibold">Something not answered here?</h2>
            <p className="mt-3 text-muted-foreground">
              Ask {BUSINESS.name} directly. There's no obligation and no follow-up sales call.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <WhatsAppButton source="faq" />
              <Link
                to="/contact"
                className="inline-flex min-h-12 items-center rounded-md border border-input px-6 text-sm font-medium hover:bg-secondary"
              >
                Other ways to reach us
              </Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
