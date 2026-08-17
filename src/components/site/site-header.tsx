import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Phone, Search } from "lucide-react";

import { MainNav } from "@/components/site/main-nav";
import { SearchOverlay } from "@/components/site/search-overlay";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuoteDraft } from "@/lib/basket";
import { BUSINESS, HEADLINE_AREAS } from "@/lib/business";
import { telHref } from "@/lib/contact-links";
import { trackEvent } from "@/lib/analytics";
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_SLUG } from "@/lib/services";

/**
 * The site header.
 *
 * Two rows on desktop, which is the dealer convention and earns its space: a
 * thin utility strip carrying the phone number and the area covered, then the
 * navigation with a services mega-panel. A mobile specialist's phone number is
 * the single most valuable thing on the page for a certain kind of customer
 * (§3: older customers, people who would simply rather ring), and burying it
 * behind a Contact link loses them.
 *
 * The strip is also where "Surrey" gets said on every page without shouting
 * about it in the logo.
 */

const MOBILE_ITEM =
  "flex min-h-[52px] items-center border-b border-border/60 px-5 text-[15px] font-medium";

const MOBILE_LINKS = [
  { to: "/packages", label: "Packages" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/service-areas", label: "Areas we cover" },
  { to: "/trade", label: "Trade" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "Questions" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const draft = useQuoteDraft();
  const count = draft.items.length;

  // ⌘K / Ctrl+K opens search. Costs nothing, and the people who reach for it
  // are exactly the busy professionals §3 asks us to remove friction for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {/* Utility strip — desktop only. On a phone the fixed bottom bar and
            the menu already carry these, and a second strip eats the fold. */}
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
                {BUSINESS.phoneDisplay}
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

          <MainNav />

          <div className="flex items-center gap-2">
            <a
              href={telHref(BUSINESS.phone)}
              className="tap inline-flex items-center justify-center rounded-md text-foreground/70 hover:text-accent lg:hidden"
              aria-label={`Call Drive Precise on ${BUSINESS.phoneDisplay}`}
              onClick={() => trackEvent("whatsapp_clicked", { meta: { source: "header-mobile" } })}
            >
              <Phone className="size-5" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="tap inline-flex items-center justify-center gap-2 rounded-md px-2 text-foreground/70 hover:text-accent lg:border lg:border-border lg:px-3 lg:text-sm lg:text-muted-foreground lg:hover:border-accent"
              aria-label="Search services"
            >
              <Search className="size-5 lg:size-4" aria-hidden="true" />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground xl:inline">
                ⌘K
              </kbd>
            </button>

            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link to="/quote">
                Get a quote
                {count > 0 && (
                  <span
                    className="tabular ml-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs"
                    aria-label={`${count} ${count === 1 ? "item" : "items"} in your request`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </Button>

            <button
              type="button"
              className="tap relative inline-flex items-center justify-center rounded-md xl:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-6" aria-hidden="true" />
              {count > 0 && (
                <span
                  className="absolute top-1.5 right-1 size-2 rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu as a real sheet: focus trapped, Escape closes it, the page
          behind stops scrolling. The previous version was a block that pushed
          content down and left the page scrolling underneath it. */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent side="right" className="xl:hidden">
          <DialogHeader>
            <DialogTitle>Menu</DialogTitle>
          </DialogHeader>

          <DialogBody className="px-0 py-0">
            <p className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Services
            </p>
            <ul>
              {CATEGORY_ORDER.map((category) => (
                <li key={category}>
                  {/* Same reasoning as the desktop panel: checks goes to its
                      own landing page, and the duplicate entry that used to
                      sit further down this menu is gone. */}
                  {category === "checks" ? (
                    <Link
                      to="/checks"
                      onClick={() => setMenuOpen(false)}
                      className={MOBILE_ITEM}
                      activeProps={{ className: "text-accent" }}
                    >
                      {CATEGORY_LABEL[category]}
                    </Link>
                  ) : (
                    <Link
                      to="/services/$category"
                      params={{ category: CATEGORY_SLUG[category] }}
                      onClick={() => setMenuOpen(false)}
                      className={MOBILE_ITEM}
                      activeProps={{ className: "text-accent" }}
                    >
                      {CATEGORY_LABEL[category]}
                    </Link>
                  )}
                </li>
              ))}
              <li>
                <Link
                  to="/services"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-[52px] items-center border-b border-border/60 px-5 text-[15px] font-medium text-accent"
                >
                  Every service, with prices
                </Link>
              </li>
            </ul>

            <p className="px-5 pt-5 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Drive Precise
            </p>
            <ul>
              {MOBILE_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[52px] items-center border-b border-border/60 px-5 text-[15px] font-medium last:border-0"
                    activeProps={{ className: "text-accent" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </DialogBody>

          <DialogFooter className="flex-col">
            <Button asChild block size="lg" onClick={() => setMenuOpen(false)}>
              <Link to="/quote">
                Get a quote
                {count > 0 && ` (${count})`}
              </Link>
            </Button>
            <WhatsAppButton block label="Message us on WhatsApp" source="mobile-menu" />
            <a
              href={telHref(BUSINESS.phone)}
              className="flex min-h-11 items-center justify-center gap-2 text-sm font-medium"
            >
              <Phone className="size-4 text-accent" aria-hidden="true" />
              {BUSINESS.phoneDisplay}
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
