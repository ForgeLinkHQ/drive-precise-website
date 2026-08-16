import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { ActiveCampaignRow } from "@/integrations/supabase/types";
import { getServiceById } from "@/lib/services";
import { getPackageById } from "@/lib/packages";

/**
 * The seasonal campaign banner (§37, §45).
 *
 * "Allow homepage banners and campaigns to change without code deployment." So
 * this reads a row and renders nothing when there isn't one — no placeholder,
 * no skeleton. A banner is an addition to the page, and a site with no campaign
 * running should look finished rather than look like it is loading something.
 *
 * The destination is validated against the catalogue before it is rendered:
 * §37 says campaigns should "lead into existing products", and a banner
 * pointing at a service that has since been switched off is a dead end the
 * customer discovers after clicking.
 */
export function CampaignBanner() {
  const [campaign, setCampaign] = useState<ActiveCampaignRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await supabase.rpc("get_active_campaign");
        const row = (data as ActiveCampaignRow[] | null)?.[0];
        if (!cancelled && row) setCampaign(row);
      } catch {
        // No campaign is the normal state. A failure here is indistinguishable
        // from that, and neither is worth telling a customer about.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!campaign) return null;

  const destination = resolveDestination(campaign);
  if (!destination) return null;

  const cta = (
    <>
      {campaign.cta_label ?? "Find out more"}
      <ArrowRight className="size-4" aria-hidden="true" />
    </>
  );

  return (
    <div className="border-b border-accent/20 bg-accent/8">
      <div className="shell flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{campaign.headline}</p>
          {campaign.body && <p className="mt-0.5 text-sm text-muted-foreground">{campaign.body}</p>}
        </div>
        {destination.kind === "quote" ? (
          <Link to="/quote" search={destination.search} className={CTA_CLASS}>
            {cta}
          </Link>
        ) : (
          <Link to={destination.to} className={CTA_CLASS}>
            {cta}
          </Link>
        )}
      </div>
    </div>
  );
}

const CTA_CLASS =
  "inline-flex shrink-0 items-center gap-2 self-start rounded-md border border-accent px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground sm:self-auto";

/**
 * Pages a campaign may point at.
 *
 * An allowlist rather than a free path. Two reasons, and the second is the one
 * that matters: a typo produces a dead banner on the homepage, and a pasted
 * external URL would turn the site's most prominent link into an off-site
 * redirect controlled by whatever wrote that row.
 */
const ALLOWED_PATHS = [
  "/services",
  "/checks",
  "/packages",
  "/modifications",
  "/return-to-standard",
  "/how-it-works",
  "/trade",
  "/contact",
] as const;

type CampaignDestination =
  | { kind: "quote"; search: { add?: string; package?: string; utm_campaign?: string } }
  | { kind: "path"; to: (typeof ALLOWED_PATHS)[number] };

function resolveDestination(campaign: ActiveCampaignRow): CampaignDestination | null {
  const utm_campaign = campaign.tracking_code ?? undefined;

  if (campaign.cta_service_id) {
    // Only link to a service the catalogue still knows about and still offers.
    const service = getServiceById(campaign.cta_service_id);
    if (!service?.active) return null;
    return { kind: "quote", search: { add: service.id, utm_campaign } };
  }

  if (campaign.cta_package_id) {
    const pkg = getPackageById(campaign.cta_package_id);
    if (!pkg?.active) return null;
    return { kind: "quote", search: { package: pkg.id, utm_campaign } };
  }

  const path = ALLOWED_PATHS.find((p) => p === campaign.cta_path);
  return path ? { kind: "path", to: path } : null;
}
