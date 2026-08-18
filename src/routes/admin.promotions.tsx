import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { supabase } from "@/integrations/supabase/client";
import type { PromotionDiagnosticRow } from "@/integrations/supabase/types";
import { SERVICES, formatGbp, retailServices } from "@/lib/services";

export const Route = createFileRoute("/admin/promotions")({
  component: AdminPromotions,
});

/**
 * Seasonal offers (§25).
 *
 * The unusual thing about this screen is that saving a promotion does not
 * publish it. The database decides that, by checking the saving against an
 * automatically-written price history: at least thirty days at the higher
 * price immediately beforehand, and a promotion no longer than that period.
 * Those are the CMA's reference-pricing principles, and since April 2025 they
 * carry real penalties.
 *
 * Which creates a usability problem worth solving properly: an offer that
 * fails the check would otherwise just never appear, with nothing to explain
 * why. So every promotion here shows its status and, when blocked, the reason
 * in plain English. Usually the answer is "wait" — a price changed recently
 * and the promotion will publish itself once the new price has aged.
 */

const SEASONS = ["", "winter", "spring", "summer", "autumn"] as const;

const EMPTY = {
  service_id: "",
  promo_price_gbp: "",
  headline: "",
  reason: "",
  terms: "",
  season: "",
  starts_on: "",
  ends_on: "",
  is_active: true,
};

function AdminPromotions() {
  const [rows, setRows] = useState<PromotionDiagnosticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("promotion_diagnostics");
    if (error) toast.error("Couldn't load promotions.");
    setRows((data ?? []) as PromotionDiagnosticRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    if (!draft.service_id || !draft.headline.trim() || !draft.starts_on || !draft.ends_on) {
      toast.error("A promotion needs a service, a headline and both dates.");
      return;
    }
    const price = Number(draft.promo_price_gbp);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("That price isn't a number.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("promotions").insert({
      service_id: draft.service_id,
      promo_price_gbp: price,
      headline: draft.headline.trim(),
      reason: draft.reason.trim() || null,
      terms: draft.terms.trim() || null,
      season: draft.season || null,
      starts_on: draft.starts_on,
      ends_on: draft.ends_on,
      is_active: draft.is_active,
    });
    setSaving(false);

    if (error) {
      toast.error("Couldn't save that. Try again.");
      return;
    }
    toast.success("Saved. Check whether it publishes below.");
    setDraft(null);
    void load();
  };

  const toggle = async (row: PromotionDiagnosticRow, next: boolean) => {
    const { error } = await supabase
      .from("promotions")
      .update({ is_active: next })
      .eq("id", row.id);
    if (error) toast.error("Couldn't change that.");
    else void load();
  };

  const live = rows.filter((r) => r.is_publishable).length;
  const pool = retailServices(SERVICES).filter((s) => s.pricing !== "quote");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} set up, ${live} showing on the site.`}
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}>New promotion</Button>
      </div>

      <div className="rounded-lg border border-border bg-secondary/40 p-5 text-sm">
        <p className="font-medium">Saving a promotion doesn't publish it.</p>
        <p className="mt-2 text-muted-foreground">
          A "was" price has to be one that genuinely held for at least thirty days immediately
          before the offer started, and the offer shouldn't run longer than that. The site checks
          this against the recorded price history and quietly leaves out anything it can't stand
          behind. If a promotion isn't showing, the reason is beside it below.
        </p>
      </div>

      {draft && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">New promotion</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Service" required>
              {(props) => (
                <Select
                  {...props}
                  value={draft.service_id}
                  onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
                >
                  <option value="">Choose a service</option>
                  {pool.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.priceGbp ? ` — normally ${formatGbp(service.priceGbp)}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Promotional price" required hint="Must be lower than the normal price.">
              {(props) => (
                <Input
                  {...props}
                  value={draft.promo_price_gbp}
                  onChange={(e) => setDraft({ ...draft, promo_price_gbp: e.target.value })}
                  inputMode="decimal"
                />
              )}
            </Field>
            <Field label="Starts" required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={draft.starts_on}
                  onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                />
              )}
            </Field>
            <Field label="Ends" required hint="A real date. It's shown to customers.">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={draft.ends_on}
                  onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                />
              )}
            </Field>
            <Field label="Season" hint="Optional. Groups it on the page.">
              {(props) => (
                <Select
                  {...props}
                  value={draft.season}
                  onChange={(e) => setDraft({ ...draft, season: e.target.value })}
                >
                  {SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {season ? season[0].toUpperCase() + season.slice(1) : "None"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <Field label="Headline" required>
              {(props) => (
                <Input
                  {...props}
                  value={draft.headline}
                  onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                  placeholder="Winter Health Check, £69"
                />
              )}
            </Field>
            <Field
              label="Why this offer, now"
              hint="A real reason beats 'limited time'. Customers can tell the difference."
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                  placeholder="Batteries fail in January, not August. Worth testing before the cold."
                />
              )}
            </Field>
            <Field label="Terms" hint="Shown next to the price, not hidden behind a link.">
              {(props) => (
                <Textarea
                  {...props}
                  value={draft.terms}
                  onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
                  placeholder="Covers the check only. Any parts or work found are quoted separately."
                />
              )}
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.headline}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.service_id} · {formatGbp(Number(row.promo_price_gbp))}
                  {row.reference_price_gbp != null &&
                    ` from ${formatGbp(Number(row.reference_price_gbp))}`}
                  {" · "}
                  {row.starts_on} to {row.ends_on}
                </p>
              </div>
              <span
                className={
                  row.is_publishable
                    ? "rounded-full border border-status-good/50 bg-status-good/10 px-3 py-1 text-xs font-medium text-status-good"
                    : "rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground"
                }
              >
                {row.is_publishable ? "Showing on the site" : "Not showing"}
              </span>
            </div>

            {row.blocked_reason && (
              <p className="mt-3 text-sm text-muted-foreground">{row.blocked_reason}</p>
            )}

            <div className="mt-4">
              <Button size="sm" variant="outline" onClick={() => toggle(row, !row.is_publishable)}>
                {row.is_publishable ? "Switch off" : "Switch on"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
