/**
 * Page metadata (§36, §50).
 *
 * One builder, so every page gets a canonical URL, an Open Graph pair and a
 * description without each route remembering to. §36 warns against "hundreds
 * of low-quality duplicate SEO pages" — the defence against that is editorial
 * (each page genuinely answers its intent), but the mechanical half is making
 * sure every page that does exist declares itself properly.
 */

import { BUSINESS } from "./business";

export interface PageMeta {
  title: string;
  description: string;
  /** Path with leading slash. Used for the canonical link. */
  path: string;
  /** Absolute URL. Falls back to the site's default social image. */
  image?: string;
  /** Set on pages that must not be indexed — admin, quote confirmation. */
  noIndex?: boolean;
}

type MetaTag =
  { title: string } | { name: string; content: string } | { property: string; content: string };

type LinkTag = { rel: string; href: string };

export function pageMeta(meta: PageMeta): { meta: MetaTag[]; links: LinkTag[] } {
  const url = `${BUSINESS.siteUrl}${meta.path === "/" ? "" : meta.path}`;
  const image = meta.image ?? `${BUSINESS.siteUrl}/og-image.jpg`;

  const tags: MetaTag[] = [
    { title: meta.title },
    { name: "description", content: meta.description },
    { property: "og:title", content: meta.title },
    { property: "og:description", content: meta.description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:site_name", content: BUSINESS.legalName },
    { name: "twitter:card", content: "summary_large_image" },
  ];

  if (meta.noIndex) {
    tags.push({ name: "robots", content: "noindex, nofollow" });
  }

  return {
    meta: tags,
    // A canonical on a noindex page is pointless and mildly contradictory, so
    // it is omitted rather than emitted alongside the robots directive.
    links: meta.noIndex ? [] : [{ rel: "canonical", href: url }],
  };
}

/**
 * LocalBusiness structured data for the homepage.
 *
 * `AutoRepair` rather than `AutomotiveBusiness`: it is the specific type Google
 * documents for this, and specificity is the whole value of the markup.
 *
 * There is no `address` beyond the region. §55 is explicit that a private
 * operating address must not be presented as somewhere customers can turn up,
 * and a PostalAddress in structured data is exactly what puts a pin on a map
 * and invites people to do that. `areaServed` carries the geography instead,
 * which is the truthful shape of a mobile business.
 */
export function localBusinessJsonLd(areaNames: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: BUSINESS.legalName,
    alternateName: BUSINESS.name,
    description:
      "Independent mobile BMW specialist. Servicing, maintenance, brakes, suspension, repairs and vehicle inspections at your home or workplace, with collection and workshop-supported repairs available.",
    url: BUSINESS.siteUrl,
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    address: {
      "@type": "PostalAddress",
      addressRegion: "Hampshire",
      addressCountry: "GB",
    },
    areaServed: areaNames.map((name) => ({ "@type": "City", name })),
    knowsAbout: ["BMW servicing", "BMW brakes", "BMW suspension", "Vehicle inspections"],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:00",
        closes: "14:00",
      },
    ],
  };
}

/** Structured data for one service page. */
export function serviceJsonLd(service: {
  name: string;
  description: string;
  pricing: "fixed" | "from" | "quote";
  priceGbp?: number;
}) {
  const base = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description,
    provider: { "@type": "AutoRepair", name: BUSINESS.legalName, url: BUSINESS.siteUrl },
    areaServed: { "@type": "AdministrativeArea", name: "Hampshire and Surrey" },
  };

  // A quote-only service gets no `offers` block at all. Emitting one with a
  // price of 0 would put "£0" in a search result, which is the single worst
  // thing this file could do.
  if (service.pricing === "quote" || service.priceGbp === undefined) return base;

  return {
    ...base,
    offers: {
      "@type": "Offer",
      priceCurrency: "GBP",
      // "From" prices are marked as the minimum rather than the price, which is
      // what PriceSpecification exists for and what keeps the markup honest.
      priceSpecification: {
        "@type": "PriceSpecification",
        priceCurrency: "GBP",
        ...(service.pricing === "from"
          ? { minPrice: service.priceGbp }
          : { price: service.priceGbp }),
      },
    },
  };
}
