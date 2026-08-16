import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, Phone, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useQuoteDraft } from "@/lib/basket";
import { BUSINESS, HEADLINE_AREAS } from "@/lib/business";
import { telHref } from "@/lib/contact-links";
import { trackEvent } from "@/lib/analytics";

/**
 * The site header.
 *
 * Two rows on desktop, which is the dealer convention and earns its space
 * here: a thin utility strip carrying the phone number and the area covered,
 * then the navigation. A mobile specialist's phone number is the single most
 * valuable thing on the page for a certain kind of customer (§3: older
 * customers, people who would simply rather ring), and burying it behind a
 * Contact link loses them.
 *
 * The strip is also where "Surrey" gets said on every page without shouting
 * about it in the logo.
 */

const NAV = [
  { to: "/services", label: "Services" },
  { to: "/checks", label: "Checks & Inspections" },
  { to: "/packages", label: "Packages" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/trade", label: "Trade" },
  { to: "/about", label: "About" },
] as const;

const MOBILE_EXTRA = [
  { to: "/service-areas", label: "Areas we cover" },
  { to: "/faq", label: "Questions" },
  { to: "/contact", label: "Contact" },
  { to: "/search", label: "Search" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const draft = useQuoteDraft();
  const count = draft.items.length;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      {/* Utility strip — desktop only. On a phone the fixed bottom bar and the
          menu already carry these, and a second strip would eat the fold. */}
      <div className="hidden border-b border-border/70 bg-secondary/60 lg:block">
        <div className="shell flex h-9 items-center justify-between text-xs">
          <p className="text-muted-foreground">
            Mobile BMW specialist covering{" "}
            <Link to="/service-areas" className="font-medium text-foreground hover:text-accent">
              {HEADLINE_AREAS.slice(0, 4).join(", ")}
            </Link>{" "}
            and across Surrey
          </p>
          <div className="flex items-center gap-5">
            <Link to="/service-areas" className="text-muted-foreground hover:text-accent">
              Check your postcode
            </Link>
            <a
              href={telHref(BUSINESS.phone)}
              onClick={() => trackEvent("whatsapp_clicked", { meta: { source: "header-strip" } })}
              className="inline-flex items-center gap-1.5 font-medium hover:text-accent"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              {BUSINESS.phone}
            </a>
          </div>
        </div>
      </div>

      <div className="shell flex items-center justify-between gap-4 py-3 lg:py-4">
        <Link to="/" className="flex flex-col leading-none" aria-label="Drive Precise, home">
          <span className="font-display text-lg font-bold tracking-tight text-primary lg:text-xl">
            DRIVE PRECISE
          </span>
          <span className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase lg:text-[11px]">
            Independent Mobile BMW Specialist
          </span>
        </Link>

        <nav className="hidden items-center gap-6 xl:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-accent"
              activeProps={{ className: "text-accent" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={telHref(BUSINESS.phone)}
            className="tap inline-flex items-center justify-center rounded-md text-foreground/70 hover:text-accent lg:hidden"
            aria-label={`Call Drive Precise on ${BUSINESS.phone}`}
            onClick={() => trackEvent("whatsapp_clicked", { meta: { source: "header-mobile" } })}
          >
            <Phone className="size-5" aria-hidden="true" />
          </a>
          <Link
            to="/search"
            className="tap hidden items-center justify-center rounded-md text-foreground/70 hover:text-accent lg:inline-flex"
            aria-label="Search services"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
          <Button asChild size="sm" className="hidden lg:inline-flex">
            <Link to="/quote">
              Get a quote
              {count > 0 && (
                <span
                  className="ml-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs tabular"
                  aria-label={`${count} ${count === 1 ? "item" : "items"} in your request`}
                >
                  {count}
                </span>
              )}
            </Link>
          </Button>
          <button
            type="button"
            className="tap inline-flex items-center justify-center rounded-md xl:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <X className="size-6" aria-hidden="true" />
            ) : (
              <Menu className="size-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border bg-background shadow-lift xl:hidden">
          <nav className="shell py-2" aria-label="Main">
            {[...NAV, ...MOBILE_EXTRA].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex min-h-[52px] items-center border-b border-border/60 text-base font-medium last:border-0"
                activeProps={{ className: "text-accent" }}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={telHref(BUSINESS.phone)}
              className="flex min-h-[52px] items-center gap-2 border-t border-border text-base font-medium"
            >
              <Phone className="size-4 text-accent" aria-hidden="true" />
              {BUSINESS.phone}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
