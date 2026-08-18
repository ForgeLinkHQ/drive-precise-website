import { Link } from "@tanstack/react-router";

import { BUSINESS, SERVICE_AREAS } from "@/lib/business";
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_SLUG, FROM_PRICE_CAVEAT } from "@/lib/services";
import { mailtoHref, telHref } from "@/lib/contact-links";

/**
 * The footer carries the legal framework (§48).
 *
 * A UK limited company must state its registered name, number and registered
 * office on its website. Those values are configuration, and when they are
 * unset the block is omitted rather than rendered with placeholder text — a
 * made-up company number is a worse outcome than a missing one, and
 * `configurationIssues()` surfaces the gap in admin where someone will act on
 * it.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-secondary/50">
      <div className="shell py-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-primary">
              DRIVE PRECISE
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {BUSINESS.descriptor}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              BMW servicing, maintenance and repairs at your home or workplace, with collection and
              workshop-supported repairs available where required.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Services</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {CATEGORY_ORDER.map((category) => (
                <li key={category}>
                  <Link
                    to="/services/$category"
                    params={{ category: CATEGORY_SLUG[category] }}
                    className="text-muted-foreground hover:text-accent"
                  >
                    {CATEGORY_LABEL[category]}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/packages" className="text-muted-foreground hover:text-accent">
                  Packages
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Drive Precise</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/how-it-works" className="text-muted-foreground hover:text-accent">
                  How it works
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-accent">
                  About
                </Link>
              </li>
              <li>
                <Link to="/service-areas" className="text-muted-foreground hover:text-accent">
                  Service areas
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-muted-foreground hover:text-accent">
                  Questions
                </Link>
              </li>
              <li>
                <Link to="/partners" className="text-muted-foreground hover:text-accent">
                  Who we work with
                </Link>
              </li>
              <li>
                <Link to="/trade" className="text-muted-foreground hover:text-accent">
                  Trade enquiries
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-accent">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Get in touch</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href={telHref(BUSINESS.phone)}
                  className="text-muted-foreground hover:text-accent"
                >
                  {BUSINESS.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={mailtoHref(BUSINESS.email)}
                  className="break-all text-muted-foreground hover:text-accent"
                >
                  {BUSINESS.email}
                </a>
              </li>
            </ul>
            <h2 className="mt-6 text-sm font-semibold">Hours</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {BUSINESS.hours.map((row) => (
                <li key={row.days} className="flex justify-between gap-4">
                  <span>{row.days}</span>
                  <span>{row.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The area list is a real navigation aid, not a keyword dump — these
            are the towns people search for, and the postcode check is the
            answer for anyone not on the list. */}
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-semibold">Where we come to</h2>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {SERVICE_AREAS.filter((a) => a.tier === "core").map((area) => (
              <li key={area.name}>{area.name}</li>
            ))}
            <li>
              <Link
                to="/service-areas"
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Check your postcode
              </Link>
            </li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Plus Weybridge, Cobham, Esher, Leatherhead, Chertsey, Egham, Bracknell, Basingstoke and
            Reading, depending on the job.
          </p>

          <p className="mt-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Pricing:</span> {FROM_PRICE_CAVEAT}{" "}
            <Link to="/legal/pricing" className="underline underline-offset-4 hover:text-accent">
              Pricing terms
            </Link>
            .
          </p>

          <p className="mt-4 text-sm text-muted-foreground">
            Drive Precise is an independent specialist. We are not affiliated with, authorised by or
            endorsed by BMW AG or BMW (UK) Ltd. BMW is our vehicle specialism, not our employer.
          </p>

          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            {/* The statutory disclosures. Registered name, company number,
                place of registration and registered office are required to be
                accessible on the site by the Trading Disclosures Regulations
                2015 and the E-Commerce Regulations 2002, and this is where
                they live. The registered office is never presented as an
                address to visit (§55). */}
            <div>
              <p>
                © {new Date().getFullYear()} {BUSINESS.legalName}
                {BUSINESS.companyNumber &&
                  ` · Registered in ${BUSINESS.placeOfRegistration}, company number ${BUSINESS.companyNumber}`}
              </p>
              {BUSINESS.registeredAddress && (
                <p className="mt-1">Registered office: {BUSINESS.registeredAddress}</p>
              )}
              {BUSINESS.vatRegistered ? (
                BUSINESS.vatNumber && <p className="mt-1">VAT registration {BUSINESS.vatNumber}</p>
              ) : (
                <p className="mt-1">
                  Not VAT registered, so no VAT is added to any price on this site.
                </p>
              )}
              <p className="mt-1">
                {BUSINESS.director.name}, {BUSINESS.director.role}
              </p>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link to="/legal/terms" className="hover:text-accent">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/legal/privacy" className="hover:text-accent">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/legal/cookies" className="hover:text-accent">
                  Cookies
                </Link>
              </li>
              <li>
                <Link to="/legal/booking" className="hover:text-accent">
                  Booking & cancellation
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
