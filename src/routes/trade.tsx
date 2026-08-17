import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeader } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { pageMeta } from "@/lib/seo";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { BUSINESS } from "@/lib/business";
import { mailtoHref } from "@/lib/contact-links";

export const Route = createFileRoute("/trade")({
  head: () =>
    pageMeta({
      title: "Trade Vehicle Preparation: BMW Specialist | Drive Precise",
      description:
        "Mechanical preparation, part-exchange checks, PDI, de-modification and batch stock work for motor traders and dealerships. On your site, or collected.",
      path: "/trade",
    }),
  component: TradePage,
});

/** §32. Capabilities only — no rates. Trade pricing is a conversation. */
const CAPABILITIES = [
  "Part-exchange and auction purchase safety checks",
  "Pre-delivery inspection and mechanical preparation",
  "Servicing across mixed stock",
  "Brakes and suspension",
  "Mechanical repairs",
  "De-modification and styling removal",
  "Vehicle collection and movement between sites",
  "Batch preparation, several cars in one visit",
  "Partner coordination for tyres, alignment, MOT and bodywork",
];

const SERVICE_OPTIONS = [
  "Part-ex safety checks",
  "PDI / preparation",
  "Servicing",
  "Brakes & suspension",
  "Mechanical repairs",
  "De-modification",
  "Vehicle movement",
  "Batch stock preparation",
];

const OPERATION_TYPES = [
  "Independent dealer",
  "Franchised dealership",
  "Sales site / forecourt",
  "Independent garage",
  "Vehicle preparation business",
  "Trader without a site",
  "Other",
];

const VOLUME_BANDS = ["Under 5", "5–15", "16–40", "41–100", "Over 100"];

function TradePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <PageHeader
          tone="deep"
          eyebrow="Trade"
          title="Vehicle preparation without additional workshop overhead"
          intro="Mechanical preparation, checks and de-modification for motor traders, dealerships and sales sites, at your site or collected. One technician, one point of contact, work that comes back right the first time."
        />

        <div className="shell py-10 lg:py-14">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl md:text-3xl">What we take on</h2>
              <ul className="mt-6 space-y-3">
                {CAPABILITIES.map((item) => (
                  <li key={item} className="flex gap-3">
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 rounded-lg border border-border bg-secondary/50 p-6">
                <h3 className="font-display text-lg font-semibold">
                  De-modification is where we're genuinely useful
                </h3>
                <p className="mt-3 text-muted-foreground">
                  Take in a modified car and it sits there costing you money while somebody works
                  out what's been done to it. We do that quickly, tell you what's worth keeping, and
                  put the rest back to factory standard so it retails properly.
                </p>
              </div>

              <div className="mt-6 rounded-lg border border-border p-6">
                <h3 className="font-display text-lg font-semibold">On pricing</h3>
                <p className="mt-3 text-muted-foreground">
                  Trade rates are agreed directly and depend on volume, location and the mix of
                  work. They aren't published here, and the retail prices elsewhere on this site
                  aren't what you'd pay. Tell us what your stock looks like and we'll put a real
                  proposal together.
                </p>
                {/* Trade buyers read every quote as ex-VAT unless told
                    otherwise. Saying it here stops a rate being compared
                    against a VAT-registered competitor on the wrong basis. */}
                <p className="mt-3 text-muted-foreground">
                  {BUSINESS.legalName} is not VAT registered, so nothing we quote has VAT added to
                  it. The rate we agree is the rate you're invoiced.
                </p>
              </div>
            </div>

            <div>
              <TradeForm />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** §33. Field for field, plus a working fallback when the database is down. */
function TradeForm() {
  const [values, setValues] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    postcode: "",
    website: "",
    operationType: "",
    volume: "",
    typicalStock: "",
    notes: "",
  });
  const [servicesRequired, setServicesRequired] = useState<string[]>([]);
  const [hasRamp, setHasRamp] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // The length checks mirror what create_trade_enquiry enforces in Postgres.
    // Without them the RPC raises, this form shows its generic failure, and the
    // dealer who wrote a long description of their operation has no idea what
    // to change. These are the highest-value enquiries on the site to lose.
    const nextErrors: Record<string, string> = {};
    if (!values.businessName.trim()) nextErrors.businessName = "Please give us your business name.";
    else if (values.businessName.trim().length > 160)
      nextErrors.businessName = "That's too long for our system. Please shorten it.";

    if (!values.contactName.trim())
      nextErrors.contactName = "Please tell us who we're speaking to.";
    else if (values.contactName.trim().length > 120)
      nextErrors.contactName = "That's too long for our system. Please shorten it.";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      nextErrors.email = "We need a working email address to send a proposal to.";
    } else if (values.email.trim().length > 254) {
      nextErrors.email = "That email address is too long. Please check it.";
    }
    if (values.phone.replace(/\D/g, "").length < 10) {
      nextErrors.phone = "Please give us a phone number we can reach you on.";
    }
    if (values.notes.trim().length > 4000) {
      nextErrors.notes =
        "That's a lot of detail, which we'd rather have than not. Please trim it to 4000 characters and send us the rest by email.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("create_trade_enquiry", {
        _business_name: values.businessName,
        _contact_name: values.contactName,
        _email: values.email,
        _phone: values.phone,
        _business_postcode: values.postcode || null,
        _website: values.website || null,
        _operation_type: values.operationType || null,
        _vehicles_per_month: values.volume || null,
        _services_required: servicesRequired as never,
        _has_ramp: hasRamp,
        _typical_stock: values.typicalStock || null,
        _notes: values.notes || null,
      });

      if (error || !data) setFailed(true);
      else {
        setReference(data);
        trackEvent("trade_enquiry_submitted");
      }
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-2xl">Thanks, that's with us</h2>
        <p className="mt-3 text-muted-foreground">
          Your reference is <strong className="font-mono text-foreground">{reference}</strong>.
          We'll come back to you to talk through volumes and what a working arrangement would look
          like.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl">Discuss trade work</h2>
      <p className="mt-2 text-muted-foreground">
        Tell us roughly what you're dealing with and we'll come back with something concrete.
      </p>

      {failed && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-border bg-secondary px-4 py-3 text-sm"
        >
          We couldn't send that just now. Email us directly at{" "}
          <a
            href={mailtoHref(BUSINESS.tradeEmail, { subject: "Trade enquiry" })}
            className="underline underline-offset-4"
          >
            {BUSINESS.tradeEmail}
          </a>{" "}
          and we'll pick it up from there.
        </p>
      )}

      <div className="mt-6 space-y-5">
        <Field label="Business name" required error={errors.businessName}>
          {(props) => (
            <Input
              {...props}
              value={values.businessName}
              onChange={(e) => set("businessName")(e.target.value)}
              autoComplete="organization"
            />
          )}
        </Field>

        <Field label="Your name" required error={errors.contactName}>
          {(props) => (
            <Input
              {...props}
              value={values.contactName}
              onChange={(e) => set("contactName")(e.target.value)}
              autoComplete="name"
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" required error={errors.email}>
            {(props) => (
              <Input
                {...props}
                type="email"
                value={values.email}
                onChange={(e) => set("email")(e.target.value)}
                autoComplete="email"
              />
            )}
          </Field>

          <Field label="Phone" required error={errors.phone}>
            {(props) => (
              <Input
                {...props}
                type="tel"
                value={values.phone}
                onChange={(e) => set("phone")(e.target.value)}
                autoComplete="tel"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business postcode">
            {(props) => (
              <Input
                {...props}
                value={values.postcode}
                onChange={(e) => set("postcode")(e.target.value)}
                className="uppercase"
                autoCapitalize="characters"
              />
            )}
          </Field>

          <Field label="Website">
            {(props) => (
              <Input
                {...props}
                value={values.website}
                onChange={(e) => set("website")(e.target.value)}
                inputMode="url"
                placeholder="example.co.uk"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Type of operation">
            {(props) => (
              <Select
                {...props}
                value={values.operationType}
                onChange={(e) => set("operationType")(e.target.value)}
              >
                <option value="">Choose one</option>
                {OPERATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Vehicles per month">
            {(props) => (
              <Select
                {...props}
                value={values.volume}
                onChange={(e) => set("volume")(e.target.value)}
              >
                <option value="">Choose one</option>
                {VOLUME_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">What would you need from us?</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {SERVICE_OPTIONS.map((option) => (
              <label key={option} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={servicesRequired.includes(option)}
                  onChange={(e) =>
                    setServicesRequired((current) =>
                      e.target.checked ? [...current, option] : current.filter((s) => s !== option),
                    )
                  }
                  className="size-4 accent-[var(--color-accent)]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Do you have a ramp or facility on site?</legend>
          <div className="mt-3 flex gap-2">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map((option) => (
              <label
                key={option.label}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 ${
                  hasRamp === option.value ? "border-accent bg-accent/8" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="ramp"
                  checked={hasRamp === option.value}
                  onChange={() => setHasRamp(option.value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Typical stock" hint="Makes, ages, price bracket, whatever's useful.">
          {(props) => (
            <Input
              {...props}
              value={values.typicalStock}
              onChange={(e) => set("typicalStock")(e.target.value)}
              placeholder="Mostly German prestige, 3–8 years old"
            />
          )}
        </Field>

        <Field label="Anything else" error={errors.notes}>
          {(props) => (
            <Textarea
              {...props}
              value={values.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" size="lg" block disabled={submitting}>
          {submitting ? "Sending…" : "Request trade discussion"}
        </Button>
      </div>
    </form>
  );
}
