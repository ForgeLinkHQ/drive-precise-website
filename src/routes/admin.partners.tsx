import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerRow } from "@/integrations/supabase/types";
import { PARTNER_LABEL } from "@/lib/partners";
import type { PartnerCategory } from "@/lib/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/partners")({
  component: AdminPartners,
});

/**
 * The partner network manager (§18, §19).
 *
 * This screen holds the two halves of a partner apart, because they answer
 * different questions and confusing them is the expensive mistake.
 *
 *   - **Active** means "we send work here". Internal.
 *   - **Listed publicly** means "this business has agreed to appear on our
 *     website by name". It defaults to off, and turning it on is a claim about
 *     someone else's business.
 *
 * Naming a company — a parts brand especially — before they have agreed is a
 * false claim of affiliation. The site already takes care over exactly this
 * with BMW. So the listing toggle is deliberately separate, deliberately off
 * by default, and deliberately labelled as a question about consent rather
 * than a visibility setting.
 *
 * The commercial fields on this page are the reason `partners` has anon
 * revoked and the public page reads through `get_public_partners()`. Nothing
 * typed into the "Commercial terms" section can reach a browser.
 */

const CATEGORIES = Object.keys(PARTNER_LABEL) as PartnerCategory[];

const EMPTY = {
  business_name: "",
  category: "tyres",
  contact_name: "",
  phone: "",
  email: "",
  location: "",
  website: "",
  public_summary: "",
  trade_arrangement: "",
  commission_type: "none",
  commission_value: "",
  internal_notes: "",
  is_active: true,
  is_publicly_listed: false,
};

type Draft = typeof EMPTY;

function AdminPartners() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("partners")
      .select("*")
      .order("category")
      .order("business_name");
    if (error) toast.error("Couldn't load partners.");
    setRows((data ?? []) as PartnerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingId(null);
    setEditing({ ...EMPTY });
  };

  const startEdit = (row: PartnerRow) => {
    setEditingId(row.id);
    setEditing({
      business_name: row.business_name ?? "",
      category: row.category ?? "tyres",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      location: row.location ?? "",
      website: row.website ?? "",
      public_summary: row.public_summary ?? "",
      trade_arrangement: row.trade_arrangement ?? "",
      commission_type: row.commission_type ?? "none",
      commission_value: row.commission_value == null ? "" : String(row.commission_value),
      internal_notes: row.internal_notes ?? "",
      is_active: row.is_active ?? true,
      is_publicly_listed: row.is_publicly_listed ?? false,
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.business_name.trim()) {
      toast.error("A partner needs a business name.");
      return;
    }

    const value = editing.commission_value.trim();
    const parsed = value === "" ? null : Number(value);
    if (parsed !== null && !Number.isFinite(parsed)) {
      toast.error("That commission value isn't a number.");
      return;
    }

    setSaving(true);
    const payload = {
      business_name: editing.business_name.trim(),
      category: editing.category,
      contact_name: editing.contact_name.trim() || null,
      phone: editing.phone.trim() || null,
      email: editing.email.trim() || null,
      location: editing.location.trim() || null,
      website: editing.website.trim() || null,
      public_summary: editing.public_summary.trim() || null,
      trade_arrangement: editing.trade_arrangement.trim() || null,
      commission_type: editing.commission_type || null,
      commission_value: parsed,
      internal_notes: editing.internal_notes.trim() || null,
      is_active: editing.is_active,
      is_publicly_listed: editing.is_publicly_listed,
    };

    const { error } = editingId
      ? await supabase.from("partners").update(payload).eq("id", editingId)
      : await supabase.from("partners").insert(payload);

    setSaving(false);
    if (error) {
      toast.error("Couldn't save that. Try again.");
      return;
    }
    toast.success(editingId ? "Saved" : "Partner added");
    setEditing(null);
    setEditingId(null);
    void load();
  };

  const listedCount = rows.filter((r) => r.is_publicly_listed && r.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Partners</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${rows.length} ${rows.length === 1 ? "partner" : "partners"}, ${listedCount} named on the website.`}
          </p>
        </div>
        <Button onClick={startNew}>Add a partner</Button>
      </div>

      {!loading && rows.length === 0 && !editing && (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No partners yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The public page already works without them: it lists the categories of work you can
            arrange. Add businesses here as you agree terms, and tick "agreed to be named" only once
            they actually have.
          </p>
        </div>
      )}

      {editing && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">
            {editingId ? "Edit partner" : "New partner"}
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Business name" required>
              {(props) => (
                <Input
                  {...props}
                  value={editing.business_name}
                  onChange={(e) => setEditing({ ...editing, business_name: e.target.value })}
                />
              )}
            </Field>
            <Field label="Category">
              {(props) => (
                <Select
                  {...props}
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {PARTNER_LABEL[category]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Contact name">
              {(props) => (
                <Input
                  {...props}
                  value={editing.contact_name}
                  onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })}
                />
              )}
            </Field>
            <Field label="Phone">
              {(props) => (
                <Input
                  {...props}
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              )}
            </Field>
            <Field label="Email">
              {(props) => (
                <Input
                  {...props}
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              )}
            </Field>
            <Field label="Town" hint="Shown publicly if they're listed.">
              {(props) => (
                <Input
                  {...props}
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                />
              )}
            </Field>
          </div>

          {/* Everything below this line can appear on the website. */}
          <h3 className="mt-8 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Public details
          </h3>
          <div className="mt-4 grid gap-4">
            <Field label="Website" hint="Shown publicly if they're listed.">
              {(props) => (
                <Input
                  {...props}
                  value={editing.website}
                  onChange={(e) => setEditing({ ...editing, website: e.target.value })}
                  placeholder="example.co.uk"
                />
              )}
            </Field>
            <Field
              label="One-line summary"
              hint="Shown publicly. Describe what they do, never what we earn."
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={editing.public_summary}
                  onChange={(e) => setEditing({ ...editing, public_summary: e.target.value })}
                  placeholder="Fitting and balancing, same day, all major brands."
                />
              )}
            </Field>
          </div>

          {/* The consent decision, deliberately given its own block rather than
              sitting in a row of checkboxes. Ticking it publishes somebody
              else's name. */}
          <div
            className={cn(
              "mt-6 rounded-lg border p-4",
              editing.is_publicly_listed
                ? "border-accent/50 bg-accent/8"
                : "border-border bg-secondary/40",
            )}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={editing.is_publicly_listed}
                onChange={(e) => setEditing({ ...editing, is_publicly_listed: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-medium">
                  This business has agreed to be named on our website
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Only tick this if they have actually said yes. Naming a company that hasn't agreed
                  is a claim about their business, not ours. Leaving it unticked still lets you send
                  them work.
                </span>
              </span>
            </label>
          </div>

          {/* Never leaves the building. The public page reads through
              get_public_partners(), which does not select any of it. */}
          <h3 className="mt-8 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Commercial terms · internal only
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            None of this reaches the website. The public read path selects five columns and these
            are not among them.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Arrangement"
              hint='Free text: "trade rate", "20% off list", "reciprocal".'
            >
              {(props) => (
                <Input
                  {...props}
                  value={editing.trade_arrangement}
                  onChange={(e) => setEditing({ ...editing, trade_arrangement: e.target.value })}
                />
              )}
            </Field>
            <Field label="Commission type">
              {(props) => (
                <Select
                  {...props}
                  value={editing.commission_type}
                  onChange={(e) => setEditing({ ...editing, commission_type: e.target.value })}
                >
                  <option value="none">None</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed per job</option>
                </Select>
              )}
            </Field>
            <Field label="Commission value" hint="Percent, or pounds for a fixed fee.">
              {(props) => (
                <Input
                  {...props}
                  value={editing.commission_value}
                  onChange={(e) => setEditing({ ...editing, commission_value: e.target.value })}
                  inputMode="decimal"
                />
              )}
            </Field>
            <Field label="Send them work?">
              {(props) => (
                <Select
                  {...props}
                  value={editing.is_active ? "yes" : "no"}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "yes" })}
                >
                  <option value="yes">Yes, active</option>
                  <option value="no">No, paused</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Internal notes">
              {(props) => (
                <Textarea
                  {...props}
                  value={editing.internal_notes}
                  onChange={(e) => setEditing({ ...editing, internal_notes: e.target.value })}
                />
              )}
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Town</th>
                <th className="px-4 py-3 text-left">Sending work</th>
                <th className="px-4 py-3 text-left">On the website</th>
                <th className="px-4 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{row.business_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {PARTNER_LABEL[row.category as PartnerCategory] ?? row.category}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.location ?? "Not set"}</td>
                  <td className="px-4 py-3">{row.is_active ? "Yes" : "Paused"}</td>
                  <td className="px-4 py-3">
                    {row.is_publicly_listed ? (
                      <span className="font-medium text-accent">Named</span>
                    ) : (
                      <span className="text-muted-foreground">Not named</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
