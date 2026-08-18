import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerReferralRow, PartnerRow } from "@/integrations/supabase/types";
import { PARTNER_LABEL, REFERRAL_STATUS_LABEL, type ReferralStatus } from "@/lib/partners";
import { formatGbp } from "@/lib/services";
import type { PartnerCategory } from "@/lib/services";

export const Route = createFileRoute("/admin/referrals")({
  component: AdminReferrals,
});

/**
 * The referral pipeline (§19).
 *
 * The point of this screen is answering one question honestly: is the partner
 * network actually worth running? A referral that is suggested and never
 * followed up looks identical to one that earned £40, unless somebody records
 * the difference — so the statuses run all the way to `commission_received`
 * rather than stopping at `referred`, and both the customer's spend and the
 * commission are recorded against each one.
 *
 * Everything here is internal. The public partner page reads through
 * `get_public_partners()`, which returns five columns and none of them are on
 * this screen.
 */

const STATUSES = Object.keys(REFERRAL_STATUS_LABEL) as ReferralStatus[];

/** Still needs somebody to do something. */
const OPEN: ReferralStatus[] = [
  "suggested",
  "customer_interested",
  "referred",
  "booked",
  "completed",
  "commission_due",
];

function money(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function AdminReferrals() {
  const [rows, setRows] = useState<PartnerReferralRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    const [referrals, partnerRows] = await Promise.all([
      supabase.from("partner_referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("partners").select("*").order("business_name"),
    ]);
    if (referrals.error) toast.error("Couldn't load referrals.");
    setRows((referrals.data ?? []) as PartnerReferralRow[]);
    setPartners((partnerRows.data ?? []) as PartnerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const partnerName = useCallback(
    (id: string | null) =>
      partners.find((p) => p.id === id)?.business_name ?? (id ? "Unknown partner" : "Not assigned"),
    [partners],
  );

  const visible = useMemo(
    () =>
      filter === "open" ? rows.filter((r) => OPEN.includes(r.status as ReferralStatus)) : rows,
    [rows, filter],
  );

  /** What the network has actually earned, and what is still owed. */
  const totals = useMemo(() => {
    let received = 0;
    let due = 0;
    let spend = 0;
    for (const row of rows) {
      const commission = money(row.commission_gbp) ?? 0;
      spend += money(row.customer_spend_gbp) ?? 0;
      if (row.status === "commission_received") received += commission;
      else if (row.status === "commission_due") due += commission;
    }
    return { received, due, spend };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} in total, ${visible.length} shown.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Commission received" value={formatGbp(totals.received)} />
        <Stat label="Commission due" value={formatGbp(totals.due)} />
        <Stat
          label="Customer spend referred"
          value={formatGbp(totals.spend)}
          hint="What partners billed, not what we earned."
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filter === "open" ? "primary" : "outline"}
          onClick={() => setFilter("open")}
        >
          Needs action
        </Button>
        <Button
          size="sm"
          variant={filter === "all" ? "primary" : "outline"}
          onClick={() => setFilter("all")}
        >
          Everything
        </Button>
      </div>

      {!loading && visible.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">Nothing here yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Referrals appear as partner work comes out of enquiries. Recording what each one earned
            is the only way to tell whether the network is worth running.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {visible.map((row) => (
          <ReferralCard
            key={row.id}
            row={row}
            partners={partners}
            partnerName={partnerName(row.partner_id)}
            onSaved={load}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReferralCard({
  row,
  partners,
  partnerName,
  onSaved,
}: {
  row: PartnerReferralRow;
  partners: PartnerRow[];
  partnerName: string;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<ReferralStatus>(row.status as ReferralStatus);
  const [partnerId, setPartnerId] = useState(row.partner_id ?? "");
  const [spend, setSpend] = useState(
    row.customer_spend_gbp == null ? "" : String(row.customer_spend_gbp),
  );
  const [commission, setCommission] = useState(
    row.commission_gbp == null ? "" : String(row.commission_gbp),
  );
  const [notes, setNotes] = useState(row.internal_notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsedSpend = spend.trim() === "" ? null : Number(spend);
    const parsedCommission = commission.trim() === "" ? null : Number(commission);

    for (const [value, name] of [
      [parsedSpend, "customer spend"],
      [parsedCommission, "commission"],
    ] as const) {
      if (value !== null && !Number.isFinite(value)) {
        toast.error(`That ${name} isn't a number.`);
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase
      .from("partner_referrals")
      .update({
        status,
        partner_id: partnerId || null,
        customer_spend_gbp: parsedSpend,
        commission_gbp: parsedCommission,
        internal_notes: notes.trim() || null,
      })
      .eq("id", row.id);

    setSaving(false);
    if (error) toast.error("Couldn't save that. Try again.");
    else {
      toast.success("Saved");
      onSaved();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-medium">
            {PARTNER_LABEL[row.service_category as PartnerCategory] ?? row.service_category}
            {row.registration && (
              <span className="ml-2 font-mono text-sm text-muted-foreground">
                {row.registration}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{partnerName}</p>
        </div>
        <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">
          {REFERRAL_STATUS_LABEL[row.status as ReferralStatus] ?? row.status}
        </span>
      </div>

      {row.service_note && <p className="mt-3 text-sm text-muted-foreground">{row.service_note}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          {(props) => (
            <Select
              {...props}
              value={status}
              onChange={(e) => setStatus(e.target.value as ReferralStatus)}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {REFERRAL_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Partner">
          {(props) => (
            <Select {...props} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">Not assigned</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.business_name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Customer spend" hint="What the partner billed them.">
          {(props) => (
            <Input
              {...props}
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
              inputMode="decimal"
            />
          )}
        </Field>
        <Field label="Our commission">
          {(props) => (
            <Input
              {...props}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              inputMode="decimal"
            />
          )}
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Internal notes">
          {(props) => (
            <Textarea {...props} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>

      <div className="mt-4">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
