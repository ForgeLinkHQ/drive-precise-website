import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () =>
    pageMeta({
      title: "About Drive Precise | BMW-trained, independent by choice",
      description:
        "Drive Precise is run by a BMW-trained technician with nearly a decade in main dealer and independent workshops. One person, start to finish.",
      path: "/about",
    }),
  component: AboutPage,
});

/**
 * §34: "Do NOT pretend Drive Precise employs a large workshop team." and
 * "Avoid inflated founder language."
 *
 * So this page says "I" rather than "we" where it's talking about the person,
 * and there is no team page, no stock photo of four people in matching polo
 * shirts, and no claim about numbers of cars serviced. The thing a customer is
 * actually deciding is whether to trust one person with their car, and the
 * honest answer to that is background and behaviour, not adjectives.
 */
const BACKGROUND = [
  {
    title: "BMW-trained",
    body: "Trained within the manufacturer network, on the diagnostic processes and repair procedures BMW themselves specify. That's where the specialism comes from.",
  },
  {
    title: "Nearly a decade of it",
    body: "Main dealer workshops and independent specialists. Servicing, diagnostics, mechanical repair, and the kind of jobs that don't appear in a textbook.",
  },
  {
    title: "Performance and prestige preparation",
    body: "Modified cars, styling work, and putting cars back to standard, which is a real skill and a large part of what Drive Precise now does.",
  },
  {
    title: "Independent by choice",
    body: "The main dealer model does a lot of things well. Explaining what's actually wrong, in language you understand, without a service advisor in the middle, is not one of them.",
  },
];

function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          eyebrow="About"
          title="BMW-trained. Independent by choice."
          intro="Drive Precise is a one-person operation, and that's the point. The person who quotes your job is the person who does it and the person who explains it afterwards."
        />

        <div className="shell py-10 lg:py-14">
          <div className="grid gap-10 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="max-w-2xl space-y-5 text-lg leading-relaxed">
                <p>
                  Most people's experience of getting a car fixed is the same: you drop it off, you
                  speak to someone who isn't going to work on it, you get a call full of words you
                  don't know, and you say yes because what else are you going to say.
                </p>
                <p>
                  Drive Precise exists because that's a bad way to run something people depend on.
                  If you're going to spend a few hundred pounds on your car, you should understand
                  what you're spending it on and why, and you should be able to see the evidence
                  rather than take it on trust.
                </p>
                <p>
                  So the work happens where the car is, wherever practical. You can watch if you
                  want to. Findings come with measurements and photos. If something can wait six
                  months, we say six months. If something is fine, we say it's fine, and we'd rather
                  tell you that and have you come back next year than sell you a job you didn't need
                  and never see you again.
                </p>
                <p>
                  Where a job genuinely needs a ramp, or specialist equipment we don't carry, we say
                  so and arrange it. Where another specialist is better placed, whether that's
                  tyres, alignment, bodywork or glass, we'll tell you that too, and we can set it up
                  for you.
                </p>
              </div>

              {/* Who "we" is. §3 asks for accountability rather than a bio, and
                  the brief is explicit about avoiding inflated founder
                  language, so this is a signature and nothing more. */}
              <p className="mt-8 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{BUSINESS.director.name}</span>
                {", "}
                {BUSINESS.director.role}, {BUSINESS.legalName}
              </p>

              <section className="mt-14" aria-labelledby="background-heading">
                <h2 id="background-heading" className="font-display text-2xl md:text-3xl">
                  The background
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {BACKGROUND.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-lg border border-border bg-card p-5 shadow-card"
                    >
                      <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-14" aria-labelledby="honest-heading">
                <h2 id="honest-heading" className="font-display text-2xl md:text-3xl">
                  Some things we're straight about
                </h2>
                <ul className="mt-6 space-y-4 text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">
                      We're not affiliated with BMW.
                    </span>{" "}
                    BMW is our specialism, not our employer. We're independent, and we're not
                    authorised or endorsed by BMW AG or BMW (UK) Ltd.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      We don't currently offer diagnostic scanning.
                    </span>{" "}
                    We're waiting on our own equipment, and we'd rather say that than half-do it
                    with a borrowed tool. When it arrives we'll add it, properly.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      We don't do air-conditioning regas.
                    </span>{" "}
                    The cabin hygiene treatment we offer deals with the smell, which is what most
                    people are actually asking about. Refrigerant work needs equipment and
                    certification we haven't got yet.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      Prices marked "from" are honest estimates.
                    </span>{" "}
                    We won't guarantee a number until we know which parts your car takes. That's not
                    evasion. It's the difference between a quote and a guess.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">We're not VAT registered.</span>{" "}
                    That means no VAT is added to anything we quote. The number you agree is the
                    number you pay, which is not always true of a quote from a larger garage.
                  </li>
                </ul>
              </section>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-lg border border-border bg-card p-6 shadow-card">
                <h2 className="font-display text-xl font-semibold">Talk to the person</h2>
                <p className="mt-3 text-muted-foreground">
                  Not a call centre and not a chatbot. Ask whatever you like, including whether
                  something is worth doing at all.
                </p>
                <div className="mt-5 space-y-3">
                  <WhatsAppButton block size="lg" label="Message us" source="about" />
                  <Button asChild block variant="outline" size="lg">
                    <Link to="/quote">Build a quote</Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
