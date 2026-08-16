import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";

/**
 * The block that ends every page.
 *
 * A page that stops is a page someone leaves. On a site where the whole point
 * is to get from "my car is making a noise" to a structured enquiry, every
 * page needs to name the two or three sensible next moves — and one of them
 * should always be a way to talk to a human, because the customers this brief
 * is written for (§3: older customers, new drivers, people who don't know the
 * vocabulary) often want to ask rather than click.
 *
 * `links` are the page-specific routes. The quote and WhatsApp actions are
 * constant, because they are the two things Drive Precise always wants
 * someone to be one tap from.
 */

export type NextLink =
  | { label: string; description: string; to: "/services" | "/checks" | "/packages" }
  | { label: string; description: string; to: "/modifications" | "/return-to-standard" }
  | { label: string; description: string; to: "/how-it-works" | "/about" | "/faq" }
  | { label: string; description: string; to: "/service-areas" | "/contact" | "/trade" }
  | {
      label: string;
      description: string;
      to: "/services/$category";
      params: { category: string };
    };

export function NextSteps({
  heading = "What next?",
  intro,
  links,
  whatsappContext,
}: {
  heading?: string;
  intro?: string;
  links: NextLink[];
  /** Topic for the WhatsApp opener, e.g. "brake work". */
  whatsappContext?: string;
}) {
  return (
    <section
      aria-labelledby="next-heading"
      className="section-y border-t border-border bg-secondary/50"
    >
      <div className="shell">
        <div className="max-w-2xl">
          <h2 id="next-heading" className="font-display text-2xl md:text-3xl">
            {heading}
          </h2>
          {intro && <p className="mt-3 text-muted-foreground">{intro}</p>}
        </div>

        {links.length > 0 && (
          <ul className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
              <li key={link.label}>
                {link.to === "/services/$category" ? (
                  <Link
                    to={link.to}
                    params={link.params}
                    className="card-lift group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-card"
                  >
                    <NextCardBody label={link.label} description={link.description} />
                  </Link>
                ) : (
                  <Link
                    to={link.to}
                    className="card-lift group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-card"
                  >
                    <NextCardBody label={link.label} description={link.description} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/quote">
              Build a quote
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <WhatsAppButton
            size="lg"
            context={whatsappContext}
            label="Ask us a question"
            source="next-steps"
          />
        </div>
      </div>
    </section>
  );
}

function NextCardBody({ label, description }: { label: string; description: string }) {
  return (
    <>
      <span className="font-display text-lg font-semibold group-hover:text-accent">{label}</span>
      <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
        Open
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </>
  );
}
