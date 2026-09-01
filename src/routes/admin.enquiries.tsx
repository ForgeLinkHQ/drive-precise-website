import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { EnquiryRow } from "@/integrations/supabase/types";
import {
  ENQUIRY_STATUS_LABEL,
  LOCATION_LABEL,
  type EnquiryStatus,
  type EnquiryLineItem,
} from "@/lib/enquiry";
import { formatGbp } from "@/lib/services";
import { handoffTextFor } from "@/lib/techman-handoff";
import { techmanBookingHref, techmanDeepLinkingConfigured } from "@/lib/techman";
import { formatMileage, formatRegistration } from "@/lib/vehicle";
import { REFERRAL_SOURCE_LABEL, type ReferralSource } from "@/lib/attribution";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/enquiries")({
  validateSearch: (search: Record<string, unknown>): { status?: string; q?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: AdminEnquiries,
});

function AdminEnquiries() {
  const { status, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/enquiries" });

  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EnquiryRow | null>(null);
  const [query, setQuery] = useState(q ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    let request = supabase
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) request = request.eq("status", status);

    if (q) {
      // Search across the four things someone actually has to hand when a
      // customer rings: their name, their number, the plate, or the reference
      // they were given. `or` with ilike is enough at this volume; if it stops
      // being enough, this becomes a trigram index rather than a bigger query.
      const term = `%${q.replace(/[%_]/g, "")}%`;
      request = request.or(
        [
          `customer_name.ilike.${term}`,
          `customer_phone.ilike.${term}`,
          `customer_email.ilike.${term}`,
          `registration.ilike.${term}`,
          `reference.ilike.${term}`,
        ].join(","),
      );
    }

    const { data } = await request;
    setRows((data ?? []) as EnquiryRow[]);
    setLoading(false);
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Enquiries</h1>
          <p className="mt-2 text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} shown`}
          </p>
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ search: (prev) => ({ ...prev, q: query.trim() || undefined }) });
          }}
        >
          <Field label="Search" className="w-64">
            {(props) => (
              <Input
                {...props}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, number, reg or DP-1042"
              />
            )}
          </Field>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="All"
          active={!status}
          onClick={() => navigate({ search: (prev) => ({ ...prev, status: undefined }) })}
        />
        {(Object.keys(ENQUIRY_STATUS_LABEL) as EnquiryStatus[]).map((value) => (
          <FilterChip
            key={value}
            label={ENQUIRY_STATUS_LABEL[value]}
            active={status === value}
            onClick={() => navigate({ search: (prev) => ({ ...prev, status: value }) })}
          />
        ))}
      </div>

      {rows.length === 0 && !loading ? (
        <p className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
          Nothing here. Either nothing has come in yet, or the filters are hiding it.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Ref</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Work</th>
                <th className="px-4 py-3 font-medium">Estimate</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const items = (row.items ?? []) as unknown as EnquiryLineItem[];
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer hover:bg-secondary/60"
                  >
                    <td className="px-4 py-3 font-mono">{row.reference}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{row.customer_name}</span>
                      <span className="text-muted-foreground">{row.customer_phone}</span>
                    </td>
                    <td className="px-4 py-3 font-mono">{formatRegistration(row.registration)}</td>
                    <td className="max-w-xs truncate px-4 py-3">
                      {items.map((i) => i.name).join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      {Number(row.indicative_total_gbp) > 0
                        ? `${row.has_from_pricing ? "~" : ""}${formatGbp(Number(row.indicative_total_gbp))}`
                        : "Not priced"}
                    </td>
                    <td className="px-4 py-3">
                      {ENQUIRY_STATUS_LABEL[row.status as EnquiryStatus] ?? row.status}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <EnquiryDetail
          enquiry={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border hover:border-accent",
      )}
    >
      {label}
    </button>
  );
}

function EnquiryDetail({
  enquiry,
  onClose,
  onSaved,
}: {
  enquiry: EnquiryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(enquiry.status);
  const [quotedTotal, setQuotedTotal] = useState(
    enquiry.quoted_total_gbp !== null ? String(enquiry.quoted_total_gbp) : "",
  );
  const [techmanRef, setTechmanRef] = useState(enquiry.techman_reference ?? "");
  const [adminNotes, setAdminNotes] = useState(enquiry.admin_notes ?? "");
  const [lostReason, setLostReason] = useState(enquiry.lost_reason ?? "");
  const [saving, setSaving] = useState(false);

  const items = (enquiry.items ?? []) as unknown as EnquiryLineItem[];

  const save = async () => {
    setSaving(true);
    const parsedTotal = quotedTotal.trim() === "" ? null : Number(quotedTotal);

    if (parsedTotal !== null && !Number.isFinite(parsedTotal)) {
      toast.error("That quoted total isn't a number.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("enquiries")
      .update({
        status,
        quoted_total_gbp: parsedTotal,
        techman_reference: techmanRef.trim() || null,
        admin_notes: adminNotes.trim() || null,
        lost_reason: status === "lost" ? lostReason.trim() || null : null,
      })
      .eq("id", enquiry.id);

    setSaving(false);
    if (error) toast.error("Couldn't save that. Try again.");
    else {
      toast.success("Saved");
      onSaved();
    }
  };

  /**
   * The TechMan handoff block (§28).
   *
   * Built by `techman-handoff.ts` rather than here, so the clipboard block, the
   * owner alert email and any future API call are all one shape. See that file
   * for why this is still a person copying text.
   */
  const handoff = handoffTextFor(enquiry);
  const bookingLink = techmanBookingHref({ registration: enquiry.registration });

  // A real modal, not a positioned div. The previous version trapped no focus,
  // ignored Escape, left the page behind scrolling and never returned focus to
  // the row that opened it — which on a phone made it genuinely hard to close.
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label={`Enquiry ${enquiry.reference}`}>
        <DialogHeader>
          <p className="font-mono text-sm text-muted-foreground">{enquiry.reference}</p>
          <DialogTitle className="mt-1 text-2xl">{enquiry.customer_name}</DialogTitle>
          <p className="mt-1 text-muted-foreground">
            {enquiry.customer_phone}
            {enquiry.customer_email && ` · ${enquiry.customer_email}`}
          </p>
        </DialogHeader>

        <DialogBody>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <Detail label="Vehicle">
              <span className="font-mono">{formatRegistration(enquiry.registration)}</span>
              {enquiry.mileage && ` · ${formatMileage(enquiry.mileage)} miles`}
            </Detail>
            <Detail label="Where">
              {enquiry.service_location
                ? LOCATION_LABEL[enquiry.service_location as keyof typeof LOCATION_LABEL]
                : "Not said"}
              {enquiry.postcode && ` · ${enquiry.postcode}`}
            </Detail>
            <Detail label="Preferred">
              {enquiry.preferred_date ?? "No preference"}
              {enquiry.preferred_window && ` · ${enquiry.preferred_window}`}
            </Detail>
            <Detail label="Found us via">
              {enquiry.referral_source
                ? (REFERRAL_SOURCE_LABEL[enquiry.referral_source as ReferralSource] ??
                  enquiry.referral_source)
                : "Unknown"}
              {enquiry.campaign && ` · ${enquiry.campaign}`}
            </Detail>
          </dl>

          <section className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground">Work requested</h3>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">
                    {item.pricing === "quote" || item.priceGbp === undefined
                      ? "Quote"
                      : `${item.pricing === "from" ? "from " : ""}${formatGbp(item.priceGbp)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Website estimate: {formatGbp(Number(enquiry.indicative_total_gbp))}
              {enquiry.has_from_pricing && " (indicative)"}
              {enquiry.quote_only_count > 0 && ` · ${enquiry.quote_only_count} to quote`}
            </p>
          </section>

          {(enquiry.customer_notes || enquiry.vehicle_notes) && (
            <section className="mt-6 rounded-md bg-secondary p-4">
              {enquiry.vehicle_notes && (
                <p className="text-sm">
                  <span className="font-medium">About the car:</span> {enquiry.vehicle_notes}
                </p>
              )}
              {enquiry.customer_notes && (
                <p className="mt-2 text-sm">
                  <span className="font-medium">Notes:</span> {enquiry.customer_notes}
                </p>
              )}
            </section>
          )}

          <div className="mt-6 space-y-5 border-t border-border pt-6">
            <Field label="Status">
              {(props) => (
                <Select {...props} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {(Object.keys(ENQUIRY_STATUS_LABEL) as EnquiryStatus[]).map((value) => (
                    <option key={value} value={value}>
                      {ENQUIRY_STATUS_LABEL[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Quoted total (£)"
                hint="What you actually quoted, once you knew the car."
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={quotedTotal}
                    onChange={(e) => setQuotedTotal(e.target.value)}
                  />
                )}
              </Field>
              <Field label="TechMan reference" hint="Once the job exists in TechMan.">
                {(props) => (
                  <Input
                    {...props}
                    value={techmanRef}
                    onChange={(e) => setTechmanRef(e.target.value)}
                  />
                )}
              </Field>
            </div>

            {status === "lost" && (
              <Field label="Why was it lost?" hint="Worth knowing. Price, timing, went elsewhere…">
                {(props) => (
                  <Input
                    {...props}
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                  />
                )}
              </Field>
            )}

            <Field label="Internal notes">
              {(props) => (
                <Textarea
                  {...props}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              )}
            </Field>

            {/* The other half of the TechMan loop (§28).
                Once a job is priced, the customer picks their own slot rather
                than the two of you trading dates over WhatsApp. The link
                preselects the vehicle, and the labour slot too once TechMan
                confirm the parameter name — see techman.ts. */}
            {bookingLink && (
              <div className="rounded-md border border-border p-4">
                <p className="text-sm font-medium">Send the customer a booking link</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {techmanDeepLinkingConfigured()
                    ? "Opens their booking with this vehicle already selected."
                    : "Opens the booking flow. It will not preselect the job until VITE_TECHMAN_SLOT_PARAM is set."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(bookingLink)
                      .then(() => {
                        trackEvent("booking_link_sent");
                        toast.success("Booking link copied");
                      })
                      .catch(() => toast.error("Couldn't copy. Select the link instead."));
                  }}
                >
                  Copy booking link
                </Button>
              </div>
            )}

            <details className="rounded-md border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Copy for TechMan</summary>
              <pre className="mt-3 overflow-x-auto rounded bg-secondary p-3 text-xs whitespace-pre-wrap">
                {handoff}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(handoff)
                    .then(() => toast.success("Copied"))
                    .catch(() => toast.error("Couldn't copy. Select the text instead."));
                }}
              >
                Copy to clipboard
              </Button>
            </details>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
