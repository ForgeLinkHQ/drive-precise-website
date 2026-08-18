import { Link } from "@tanstack/react-router";
import { CircleDollarSign, ClipboardCheck, MessageSquare, UserRound } from "lucide-react";

/**
 * Why people call us back.
 *
 * Deliberately not a testimonial wall. §39 is explicit that only real reviews
 * may be displayed, and there aren't any yet — a row of invented five-star
 * quotes is the single fastest way to lose the trust this whole site is built
 * to earn.
 *
 * So this does the job a testimonial section is *supposed* to do — answer "why
 * would I use this person instead of the garage down the road" — using things
 * that are verifiably true today. Each one is a promise the site itself keeps:
 * the pricing model, the health report, the single point of contact, the
 * evidence-led recommendation. When real reviews exist they go beneath this,
 * not instead of it.
 */

const REASONS = [
  {
    icon: UserRound,
    title: "One person, start to finish",
    body: "The person who quotes your job is the person who does it and the person who explains it afterwards. No service advisor in the middle translating badly.",
  },
  {
    icon: CircleDollarSign,
    title: "You see the price before you commit",
    body: "Prices are on the site. Where a figure depends on which engine your car has we say so, confirm it for your car, and you're free to walk away at that point owing nothing.",
    to: "/legal/pricing" as const,
    linkLabel: "How our pricing works",
  },
  {
    icon: ClipboardCheck,
    title: "Findings come with measurements",
    body: "Pad thickness in millimetres, tread depth, photos. Green, amber or red, with the reason attached, so you decide rather than being told.",
    to: "/checks" as const,
    linkLabel: "See how we report findings",
  },
  {
    icon: MessageSquare,
    title: "If it can wait, we say it can wait",
    body: "And if it's fine, we say it's fine. We'd rather tell you that and see you again next year than sell you a job you didn't need and never hear from you.",
  },
];

export function TrustPanel() {
  return (
    <section aria-labelledby="trust-heading">
      <div className="rule-accent pt-8">
        <h2 id="trust-heading" className="font-display text-3xl md:text-4xl">
          Why people call us back
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          We're a small operation looking after families, their kids' first cars and the odd
          enthusiast. That only works if you'd recommend us, so the whole thing is built around
          being worth recommending.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {REASONS.map((reason) => (
          <article
            key={reason.title}
            className="card-lift rounded-lg border border-border bg-card p-6 shadow-card"
          >
            <reason.icon className="size-6 text-accent" aria-hidden="true" />
            <h3 className="mt-4 font-display text-lg font-semibold">{reason.title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{reason.body}</p>
            {reason.to && (
              <Link
                to={reason.to}
                className="mt-4 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                {reason.linkLabel}
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
