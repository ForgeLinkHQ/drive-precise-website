import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { supabase } from "@/integrations/supabase/client";
import type { ServiceRow } from "@/integrations/supabase/types";
import {
  CATEGORY_LABEL,
  SERVICES,
  priceLabel,
  type PricingType,
  type Service,
} from "@/lib/services";
import { PACKAGES } from "@/lib/packages";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/catalogue")({
  component: AdminCatalogue,
});

/**
 * The catalogue manager (§42).
 *
 * Two states this screen has to handle, and the difference matters:
 *
 *   - **Nothing published.** The site is serving the catalogue compiled into
 *     the app. Prices cannot be edited, because there is nothing to edit — the
 *     only action is to publish the shipped catalogue into the database, after
 *     which it becomes editable.
 *   - **Published.** The database is the source of truth and every field here
 *     writes to it.
 *
 * Showing an editable price field in the first state would be the worst
 * outcome: someone changes a number, saves, and the site carries on serving the
 * hardcoded one.
 */
function AdminCatalogue() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("services")
      .select("*")
      .order("category")
      .order("sort_order");
    setRows((data ?? []) as ServiceRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    setPublishing(true);
    const { error } = await supabase.from("services").upsert(SERVICES.map(serviceToRow));
    const { error: packageError } = await supabase.from("service_packages").upsert(
      PACKAGES.map((pkg, index) => ({
        id: pkg.id,
        name: pkg.name,
        short_description: pkg.shortDescription,
        description: pkg.description,
        includes: pkg.includes as never,
        also_includes: (pkg.alsoIncludes ?? []) as never,
        pricing: pkg.pricing,
        price_gbp: pkg.priceGbp ?? null,
        price_confirmed: pkg.priceConfirmed,
        duration_minutes: pkg.durationMinutes ?? null,
        seasons: (pkg.seasons ?? []) as never,
        customer_type: pkg.customerType,
        featured: pkg.featured ?? false,
        sort_order: index,
        is_active: pkg.active,
      })),
    );
    setPublishing(false);

    if (error || packageError) {
      toast.error("Couldn't publish the catalogue. Check the console for detail.");
      console.error(error ?? packageError);
    } else {
      toast.success("Catalogue published. Prices are now editable here.");
      void load();
    }
  };

  const unconfirmed = rows.filter((r) => r.price_gbp !== null && !r.price_confirmed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Catalogue</h1>
          <p className="mt-2 text-muted-foreground">
            {loading
              ? "Loading…"
              : rows.length === 0
                ? "Nothing published. The site is serving the built-in catalogue."
                : `${rows.length} services published. ${unconfirmed.length} prices still unconfirmed.`}
          </p>
        </div>
        <Button onClick={publish} disabled={publishing}>
          {publishing
            ? "Publishing…"
            : rows.length === 0
              ? "Publish built-in catalogue"
              : "Re-publish from code"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold">The built-in catalogue</h2>
          <p className="mt-3 text-muted-foreground">
            The site is currently serving the catalogue compiled into the app. It works, and
            visitors see a complete price list, but nothing here can be edited until it's published
            to the database. Publishing copies every service and package across, after which this
            screen edits the live values and the site picks them up without a deploy.
          </p>
          <div className="mt-6 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {SERVICES.map((service) => (
                  <tr key={service.id}>
                    <td className="px-4 py-3">{service.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {CATEGORY_LABEL[service.category]}
                    </td>
                    <td className="px-4 py-3">{priceLabel(service)}</td>
                    <td className="px-4 py-3">
                      <ServiceStatus service={service} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Pricing</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Confirmed</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <CatalogueRow key={row.id} row={row} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServiceStatus({ service }: { service: Service }) {
  if (!service.active) {
    return (
      <span title={service.inactiveReason} className="text-muted-foreground">
        Off
      </span>
    );
  }
  if (service.priceGbp !== undefined && !service.priceConfirmed) {
    return <span className="text-status-monitor">Placeholder price</span>;
  }
  return <span className="text-status-good">Live</span>;
}

function CatalogueRow({ row, onSaved }: { row: ServiceRow; onSaved: () => void }) {
  const [pricing, setPricing] = useState<PricingType>(row.pricing as PricingType);
  const [price, setPrice] = useState(row.price_gbp !== null ? String(row.price_gbp) : "");
  const [confirmed, setConfirmed] = useState(row.price_confirmed);
  const [active, setActive] = useState(row.is_active);
  const [saving, setSaving] = useState(false);

  const dirty =
    pricing !== row.pricing ||
    price !== (row.price_gbp !== null ? String(row.price_gbp) : "") ||
    confirmed !== row.price_confirmed ||
    active !== row.is_active;

  const save = async () => {
    // The same rule the CHECK constraint enforces, caught here so the person
    // gets a sentence rather than a Postgres error string.
    if (pricing !== "quote" && price.trim() === "") {
      toast.error("A fixed or 'from' price needs a number. Use 'quote' if there isn't one.");
      return;
    }
    const parsed = pricing === "quote" ? null : Number(price);
    if (parsed !== null && !Number.isFinite(parsed)) {
      toast.error("That price isn't a number.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("services")
      .update({
        pricing,
        price_gbp: parsed,
        price_confirmed: confirmed,
        is_active: active,
      })
      .eq("id", row.id);
    setSaving(false);

    if (error) toast.error("Couldn't save that.");
    else {
      toast.success(`${row.name} updated`);
      onSaved();
    }
  };

  return (
    <tr className={cn(!active && "opacity-60")}>
      <td className="px-4 py-3">
        <span className="block font-medium">{row.name}</span>
        <span className="text-muted-foreground">
          {CATEGORY_LABEL[row.category as keyof typeof CATEGORY_LABEL] ?? row.category}
        </span>
        {row.inactive_reason && (
          <span className="mt-1 block max-w-sm text-xs text-muted-foreground">
            {row.inactive_reason}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <Select
          value={pricing}
          onChange={(e) => setPricing(e.target.value as PricingType)}
          aria-label={`Pricing type for ${row.name}`}
          className="min-h-11 w-32 py-2"
        >
          <option value="fixed">Fixed</option>
          <option value="from">From</option>
          <option value="quote">Quote</option>
        </Select>
      </td>
      <td className="px-4 py-3">
        {pricing === "quote" ? (
          <span className="text-muted-foreground">On quote</span>
        ) : (
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            aria-label={`Price for ${row.name}`}
            className="min-h-11 w-28 py-2"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
            aria-label={`Price confirmed for ${row.name}`}
          />
          <span className={cn("text-xs", !confirmed && "text-status-monitor")}>
            {confirmed ? "Yes" : "Placeholder"}
          </span>
        </label>
      </td>
      <td className="px-4 py-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
            aria-label={`${row.name} active`}
          />
          <span className="text-xs">{active ? "On" : "Off"}</span>
        </label>
      </td>
      <td className="px-4 py-3">
        {dirty && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "…" : "Save"}
          </Button>
        )}
      </td>
    </tr>
  );
}

/** A code-catalogue service as a database row, for the publish action. */
function serviceToRow(service: Service, index: number) {
  return {
    id: service.id,
    name: service.name,
    category: service.category,
    short_description: service.shortDescription,
    description: service.description,
    includes: (service.includes ?? []) as never,
    pricing: service.pricing,
    price_gbp: service.priceGbp ?? null,
    price_suffix: service.priceSuffix ?? null,
    price_confirmed: service.priceConfirmed,
    duration_minutes: service.durationMinutes ?? null,
    mobile: service.mobile,
    workshop_recommended: service.workshopRecommended,
    collection_available: service.collectionAvailable,
    requires_parts_quote: service.requiresPartsQuote,
    add_ons: (service.addOns ?? []) as never,
    incompatible_with: (service.incompatibleWith ?? []) as never,
    suggests_partner: (service.suggestsPartner ?? []) as never,
    seasons: (service.seasons ?? []) as never,
    also_in: (service.alsoIn ?? []) as never,
    customer_type: service.customerType,
    mod_stream: service.modStream ?? null,
    add_on_only: service.addOnOnly ?? false,
    featured: service.featured ?? false,
    sort_order: index,
    is_active: service.active,
    inactive_reason: service.inactiveReason ?? null,
    parts_cost_gbp: service.internal?.partsCostGbp ?? null,
    consumables_cost_gbp: service.internal?.consumablesCostGbp ?? null,
    labour_allocation_mins: service.internal?.labourAllocationMinutes ?? null,
    travel_minutes: service.internal?.travelMinutes ?? null,
    internal_notes: service.internal?.notes ?? null,
  };
}
