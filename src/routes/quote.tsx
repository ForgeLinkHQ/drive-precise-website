import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { BasketPanel } from "@/components/site/basket-panel";
import { AddOnList } from "@/components/site/addon-list";
import { ServiceCard } from "@/components/site/service-card";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RegPlate, RegPlateInput } from "@/components/site/reg-plate";
import { BuilderSummaryBar } from "@/components/site/builder-summary-bar";
import { VehicleConfirmation } from "@/components/site/vehicle-confirmation";
import { pageMeta } from "@/lib/seo";
import { useCatalogue } from "@/lib/service-catalog";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  FROM_PRICE_CAVEAT,
  formatGbp,
  retailServices,
  type ServiceCategory,
} from "@/lib/services";
import {
  addItem,
  basketTotals,
  clearDraft,
  resolveItems,
  setContact,
  setLocation,
  setNotes,
  setTiming,
  setVehicle,
  useQuoteDraft,
  type ServiceLocation,
  type TimeWindow,
} from "@/lib/basket";
import {
  buildSnapshot,
  submitEnquiry,
  validateDraft,
  LOCATION_LABEL,
  type EnquirySnapshot,
} from "@/lib/enquiry";
import { buildWhatsAppMessage } from "@/lib/whatsapp";
import { selfBookableSlot, techmanBookingHref, techmanPortalConfigured } from "@/lib/techman";
import { checkCoverage } from "@/lib/business";
import { formatRegistration, isPlausibleRegistration } from "@/lib/vehicle";
import { ASKABLE_SOURCES, REFERRAL_SOURCE_LABEL, type ReferralSource } from "@/lib/attribution";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The service builder (§22) — "A BMW SERVICE CHECKOUT" (§67).
 *
 * Deliveroo, not a contact form: the customer builds something, sees what it
 * is likely to cost while they build it, and only hands over personal details
 * once they have decided what they want (§59).
 *
 * The steps are a state machine held in this component rather than in the URL.
 * That is deliberate — the draft itself is persisted in localStorage by
 * basket.ts, so a reload puts someone back at the start of a form they have
 * already filled in rather than deep-linking them into step five with an empty
 * basket. Going backwards never clears anything.
 */

interface QuoteSearch {
  /** Preselect a service, from the symptom router or a campaign. */
  add?: string;
  /** Preselect a package. */
  package?: string;
  utm_campaign?: string;
}

export const Route = createFileRoute("/quote")({
  validateSearch: (search: Record<string, unknown>): QuoteSearch => ({
    add: typeof search.add === "string" ? search.add : undefined,
    package: typeof search.package === "string" ? search.package : undefined,
    utm_campaign: typeof search.utm_campaign === "string" ? search.utm_campaign : undefined,
  }),
  head: () =>
    pageMeta({
      title: "Get a quote | Drive Precise",
      description:
        "Tell us your registration, choose what you'd like doing, and we'll confirm the price for your exact BMW. Takes about two minutes.",
      path: "/quote",
    }),
  component: QuotePage,
});

const STEPS = [
  { id: "vehicle", label: "Vehicle" },
  { id: "services", label: "Service" },
  { id: "extras", label: "Extras" },
  { id: "location", label: "Where & when" },
  { id: "details", label: "Your details" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function QuotePage() {
  const search = Route.useSearch();
  const { services } = useCatalogue();
  const draft = useQuoteDraft();

  const [step, setStep] = useState<StepId>("vehicle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ snapshot: EnquirySnapshot; warning?: string } | null>(
    null,
  );
  const [referralSource, setReferralSource] = useState<ReferralSource | "">("");

  const pool = useMemo(() => retailServices(services), [services]);

  // Preselection from the symptom router or a campaign banner.
  useEffect(() => {
    if (search.add) addItem("service", search.add);
    if (search.package) addItem("package", search.package);
  }, [search.add, search.package]);

  useEffect(() => {
    trackEvent("builder_started");
  }, []);

  const items = resolveItems(draft.items, services);
  const totals = basketTotals(items);

  if (result) {
    return <SentScreen snapshot={result.snapshot} warning={result.warning} />;
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goTo = (next: StepId) => {
    setStep(next);
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
    if (next === "location") trackEvent("location_step_reached", { itemCount: items.length });
    if (next === "details") trackEvent("details_step_reached", { itemCount: items.length });
    if (next === "review") {
      trackEvent("review_step_reached", {
        itemCount: items.length,
        basketValueGbp: totals.indicativeTotalGbp,
      });
    }
  };

  const onSubmit = async () => {
    const validation = validateDraft(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      // Send them back to the step that owns the first problem, rather than
      // showing an error about a field that isn't on screen. Every key
      // validateDraft can produce is routed here: a message on a step the
      // customer cannot see is the same as no message at all, and it leaves
      // them with a button that refuses to work and no reason given.
      if (validation.errors.registration || validation.errors.vehicleNotes) setStep("vehicle");
      else if (validation.errors.items) setStep("services");
      else setStep("details");
      return;
    }

    setSubmitting(true);
    const snapshot = buildSnapshot(draft, {
      referralSource: referralSource || undefined,
      services,
    });
    const outcome = await submitEnquiry(snapshot);
    setSubmitting(false);

    trackEvent("quote_requested", {
      itemCount: snapshot.items.length,
      basketValueGbp: snapshot.indicativeTotalGbp,
      meta: { stored: outcome.ok },
    });

    setResult(
      outcome.ok
        ? { snapshot: outcome.snapshot }
        : { snapshot: outcome.snapshot, warning: outcome.message },
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <div className="border-b border-border bg-secondary/40">
          <div className="shell py-8 lg:py-10">
            <h1 className="text-3xl md:text-4xl">Build your quote</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Tell us about the car and what you'd like doing. We'll confirm the exact price for
              your vehicle before anything is booked.
            </p>
            {/* A rail as well as chips. The chips say which step; the rail
                says how much is left, which is what stops someone abandoning
                at step three thinking there are ten. */}
            <div className="mt-6 max-w-md">
              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
                </span>
                <span className="tabular">
                  About {Math.max(1, STEPS.length - stepIndex)} min left
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-valuenow={stepIndex + 1}
                aria-label="Quote progress"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>
            <StepIndicator current={stepIndex} onJump={(id) => goTo(id)} />
          </div>
        </div>

        <div className="shell grid gap-8 py-10 pb-28 lg:grid-cols-3 lg:py-14 lg:pb-14">
          <div className="lg:col-span-2">
            {step === "vehicle" && <VehicleStep errors={errors} onNext={() => goTo("services")} />}
            {step === "services" && (
              <ServicesStep
                services={pool}
                error={errors.items}
                onBack={() => goTo("vehicle")}
                onNext={() => goTo("extras")}
              />
            )}
            {step === "extras" && (
              <div className="space-y-8">
                <AddOnList services={services} />
                <StepNav onBack={() => goTo("services")} onNext={() => goTo("location")} />
              </div>
            )}
            {step === "location" && (
              <LocationStep onBack={() => goTo("extras")} onNext={() => goTo("details")} />
            )}
            {step === "details" && (
              <DetailsStep
                errors={errors}
                referralSource={referralSource}
                onReferralSource={setReferralSource}
                onBack={() => goTo("location")}
                onNext={() => goTo("review")}
              />
            )}
            {step === "review" && (
              <ReviewStep
                services={services}
                submitting={submitting}
                onBack={() => goTo("details")}
                onSubmit={onSubmit}
                onEditStep={goTo}
              />
            )}
          </div>

          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <BasketPanel
              services={services}
              onEmptyAction={
                step !== "services" ? (
                  <Button size="sm" variant="outline" onClick={() => goTo("services")}>
                    Choose a service
                  </Button>
                ) : undefined
              }
            />
          </aside>
        </div>
      </main>

      {/* The mobile equivalent of the sticky column above. Its primary action
          mirrors the step's own Continue button rather than duplicating the
          logic, so the two can never disagree about whether you may proceed. */}
      <BuilderSummaryBar
        services={services}
        onContinue={NEXT_STEP[step] ? () => goTo(NEXT_STEP[step]!) : undefined}
        continueLabel={step === "details" ? "Review" : "Continue"}
        continueDisabled={step === "vehicle" && !draft.vehicle.registration.trim()}
      />

      <SiteFooter />
    </div>
  );
}

/**
 * Which step follows which.
 *
 * A lookup rather than an index shift, so the mobile bar and the in-page
 * buttons agree by construction. `review` maps to nothing — the last step's
 * action is submitting, which needs validation the bar doesn't do.
 */
const NEXT_STEP: Record<StepId, StepId | undefined> = {
  vehicle: "services",
  services: "extras",
  extras: "location",
  location: "details",
  details: "review",
  review: undefined,
};

function StepIndicator({ current, onJump }: { current: number; onJump: (id: StepId) => void }) {
  return (
    <ol className="mt-6 flex flex-wrap gap-x-2 gap-y-2" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={step.id}>
            <button
              type="button"
              // Only completed steps are jumpable. Letting someone skip to
              // "Your details" before choosing a service would present a form
              // that cannot be submitted, with no explanation of why.
              disabled={state === "todo"}
              onClick={() => onJump(step.id)}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                state === "current" && "border-accent bg-accent text-accent-foreground",
                state === "done" && "border-border bg-background hover:border-accent",
                state === "todo" && "border-border/60 text-muted-foreground",
              )}
            >
              {state === "done" && <Check className="size-3" aria-hidden="true" />}
              {index + 1}. {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 border-t border-border pt-6">
      {onBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ── Step 1: Vehicle (§22 step 1, §21) ────────────────────────────────────

function VehicleStep({ errors, onNext }: { errors: Record<string, string>; onNext: () => void }) {
  const draft = useQuoteDraft();
  const [touched, setTouched] = useState(false);

  const reg = draft.vehicle.registration;
  const looksWrong = touched && reg.length > 0 && !isPlausibleRegistration(reg);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Which car are we looking at?</h2>
        <p className="mt-2 text-muted-foreground">
          The registration lets us identify the right parts and give you an accurate price. We don't
          need anything else about you yet.
        </p>
      </div>

      {/* The plate, not a text box — the same control as the hero, so someone
          who started there recognises where they've landed. It also handles
          the mobile keyboard properly: characters, no autocorrect, no
          sentence-casing "AB12CDE" into something else. */}
      <RegPlateInput
        value={reg}
        onChange={(value) => setVehicle({ registration: value })}
        onBlur={() => setTouched(true)}
        label="Registration"
        hint="For example AB12 CDE"
        size="lg"
        error={
          errors.registration ??
          (looksWrong ? "That doesn't look like a UK registration. Please check it." : undefined)
        }
      />

      {/* Confirms the car back to the customer from the DVLA record. Renders
          nothing at all when the lookup is unconfigured or unavailable, so
          this step behaves exactly as it did before the feature existed. */}
      <VehicleConfirmation registration={reg} onFound={(lookup) => setVehicle({ lookup })} />

      <Field label="Mileage" hint="Roughly is fine. It helps us tell you what's due.">
        {(props) => (
          <Input
            {...props}
            value={draft.vehicle.mileage}
            onChange={(e) => setVehicle({ mileage: e.target.value })}
            inputMode="numeric"
            placeholder="52,400"
          />
        )}
      </Field>

      <Field
        label="Anything you'd like to mention about the car?"
        hint="Noises, warning lights, when you last had it serviced, whatever seems relevant."
        error={errors.vehicleNotes}
      >
        {(props) => (
          <Textarea
            {...props}
            value={draft.vehicle.notes}
            onChange={(e) => setVehicle({ notes: e.target.value })}
            placeholder="It's started knocking over speed bumps since I hit a pothole."
          />
        )}
      </Field>

      <StepNav onNext={onNext} nextDisabled={!reg.trim()} />
    </div>
  );
}

// ── Step 2: Choose a service (§22 steps 2–3) ─────────────────────────────

function ServicesStep({
  services,
  error,
  onBack,
  onNext,
}: {
  services: ReturnType<typeof retailServices>;
  error?: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const draft = useQuoteDraft();
  const [category, setCategory] = useState<ServiceCategory>("servicing");

  const inCategory = services.filter(
    (s) => !s.addOnOnly && (s.category === category || s.alsoIn?.includes(category)),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">What would you like doing?</h2>
        <p className="mt-2 text-muted-foreground">
          Add as much or as little as you like. Not sure?{" "}
          <Link
            to="/"
            hash="symptom-heading"
            className="underline underline-offset-4 hover:text-accent"
          >
            Start from what the car is doing
          </Link>{" "}
          instead.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Service categories">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium",
              category === c
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border hover:border-accent",
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {inCategory.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{FROM_PRICE_CAVEAT}</p>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextDisabled={draft.items.length === 0}
        nextLabel={draft.items.length === 0 ? "Add something to continue" : "Continue"}
      />
    </div>
  );
}

// ── Step 4: Where and when (§22 steps 6–7) ───────────────────────────────

const LOCATION_OPTIONS: ServiceLocation[] = ["home", "workplace", "collection", "unsure"];
const WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "flexible", label: "I'm flexible" },
];

function LocationStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const draft = useQuoteDraft();
  const coverage = draft.location.postcode ? checkCoverage(draft.location.postcode) : null;

  // The earliest date anyone can sensibly ask for. Not a promise of
  // availability — §22 step 7 is explicit that a preference is not a booking.
  const today = new Date();
  const minDate = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Where should we work on the vehicle?</h2>
        <p className="mt-2 text-muted-foreground">
          Most work happens wherever the car normally sits. If a job needs a ramp we'll tell you and
          arrange collection.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Location</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {LOCATION_OPTIONS.map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-3",
                draft.location.kind === option ? "border-accent bg-accent/8" : "border-border",
              )}
            >
              <input
                type="radio"
                name="location"
                value={option}
                checked={draft.location.kind === option}
                onChange={() => setLocation({ kind: option })}
                className="size-4 accent-[var(--color-accent)]"
              />
              <span className="text-sm font-medium">{LOCATION_LABEL[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Postcode" hint="So we can check we cover you and work out travel.">
        {(props) => (
          <Input
            {...props}
            value={draft.location.postcode}
            onChange={(e) => setLocation({ postcode: e.target.value })}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="uppercase"
            placeholder="GU15"
          />
        )}
      </Field>

      {coverage && (
        <p
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            coverage.status === "core" && "border-status-good/40 bg-status-good/8",
            coverage.status === "extended" && "border-border bg-secondary",
            (coverage.status === "outside" || coverage.status === "unrecognised") &&
              "border-border bg-secondary",
          )}
        >
          {coverage.status === "core" && `Yes, ${coverage.area.name} is well within our area.`}
          {coverage.status === "extended" &&
            `We do cover ${coverage.area.name}. There may be a travel charge depending on the job, and we'll tell you before you commit to anything.`}
          {coverage.status === "outside" &&
            "That's outside the areas we normally cover, but send the request anyway. Depending on the work it may still be worth a trip, and we'll tell you honestly either way."}
          {coverage.status === "unrecognised" &&
            "We couldn't read that as a postcode. Carry on anyway and we'll sort it out when we speak."}
        </p>
      )}

      <div className="border-t border-border pt-6">
        <h2 className="font-display text-2xl">When suits you?</h2>
        <p className="mt-2 text-muted-foreground">
          This is a preference, not a booking. We'll confirm what's actually available when we come
          back to you with your price.
        </p>
      </div>

      <Field label="Preferred date">
        {(props) => (
          <Input
            {...props}
            type="date"
            min={minDate}
            value={draft.timing.preferredDate}
            onChange={(e) => setTiming({ preferredDate: e.target.value })}
          />
        )}
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Preferred time</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2",
                draft.timing.window === option.value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border",
              )}
            >
              <input
                type="radio"
                name="window"
                value={option.value}
                checked={draft.timing.window === option.value}
                onChange={() => setTiming({ window: option.value })}
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step 5: Contact details (§22 step 8) ─────────────────────────────────

function DetailsStep({
  errors,
  referralSource,
  onReferralSource,
  onBack,
  onNext,
}: {
  errors: Record<string, string>;
  referralSource: ReferralSource | "";
  onReferralSource: (value: ReferralSource | "") => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const draft = useQuoteDraft();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">How do we get back to you?</h2>
        <p className="mt-2 text-muted-foreground">
          A mobile number is all we really need, because most of this happens on WhatsApp.
        </p>
      </div>

      <Field label="Your name" required error={errors.name}>
        {(props) => (
          <Input
            {...props}
            value={draft.contact.name}
            onChange={(e) => setContact({ name: e.target.value })}
            autoComplete="name"
          />
        )}
      </Field>

      <Field label="Mobile number" required error={errors.phone}>
        {(props) => (
          <Input
            {...props}
            type="tel"
            inputMode="tel"
            value={draft.contact.phone}
            onChange={(e) => setContact({ phone: e.target.value })}
            autoComplete="tel"
            placeholder="07700 900123"
          />
        )}
      </Field>

      <Field
        label="Email"
        hint="Optional, but handy for sending you the written quote."
        error={errors.email}
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            value={draft.contact.email}
            onChange={(e) => setContact({ email: e.target.value })}
            autoComplete="email"
          />
        )}
      </Field>

      <Field label="Anything else we should know?" error={errors.notes}>
        {(props) => (
          <Textarea
            {...props}
            value={draft.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Parking is tight, or I work shifts, or the car's at my mum's this week."
          />
        )}
      </Field>

      <Field label="How did you hear about us?" hint="Optional, but it genuinely helps.">
        {(props) => (
          <Select
            {...props}
            value={referralSource}
            onChange={(e) => onReferralSource(e.target.value as ReferralSource | "")}
          >
            <option value="">Prefer not to say</option>
            {ASKABLE_SOURCES.map((source) => (
              <option key={source} value={source}>
                {REFERRAL_SOURCE_LABEL[source]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="Review your request" />
    </div>
  );
}

// ── Step 6: Review (§22 step 9) ──────────────────────────────────────────

function ReviewStep({
  services,
  submitting,
  onBack,
  onSubmit,
  onEditStep,
}: {
  services: ReturnType<typeof useCatalogue>["services"];
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onEditStep: (id: StepId) => void;
}) {
  const draft = useQuoteDraft();
  const items = resolveItems(draft.items, services);
  const totals = basketTotals(items);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Check this over</h2>
        <p className="mt-2 text-muted-foreground">
          Nothing is booked and nothing is charged. This sends us a request; we come back with a
          price for your exact car.
        </p>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border">
        <ReviewRow label="Vehicle" onEdit={() => onEditStep("vehicle")}>
          {formatRegistration(draft.vehicle.registration) || "Not given"}
          {draft.vehicle.mileage && ` · ${draft.vehicle.mileage} miles`}
        </ReviewRow>
        <ReviewRow label="Work requested" onEdit={() => onEditStep("services")}>
          {items.length > 0 ? items.map((i) => i.name).join(", ") : "Nothing selected"}
        </ReviewRow>
        <ReviewRow label="Where & when" onEdit={() => onEditStep("location")}>
          {draft.location.kind ? LOCATION_LABEL[draft.location.kind] : "Not said"}
          {draft.location.postcode && ` · ${draft.location.postcode.toUpperCase()}`}
          {draft.timing.preferredDate && ` · ${draft.timing.preferredDate}`}
        </ReviewRow>
        <ReviewRow label="You" onEdit={() => onEditStep("details")}>
          {draft.contact.name || "Not given"}
          {draft.contact.phone && ` · ${draft.contact.phone}`}
          {draft.contact.email && ` · ${draft.contact.email}`}
        </ReviewRow>
      </dl>

      <div className="rounded-lg border border-border bg-secondary/50 p-5">
        <p className="text-sm leading-relaxed">
          {totals.hasFromPricing ? (
            <>
              Your displayed total of <strong>{formatGbp(totals.indicativeTotalGbp)}</strong> is
              indicative, because some of the work is marked "from". Drive Precise will verify your
              vehicle specification and confirm the final price before anything is booked.
            </>
          ) : totals.pricedCount > 0 ? (
            <>
              Your displayed total is <strong>{formatGbp(totals.indicativeTotalGbp)}</strong>. We
              confirm this against your vehicle before booking.
            </>
          ) : (
            <>
              Everything you've chosen is priced for the specific vehicle. We'll come back with a
              figure once we've identified the parts your car needs.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button type="button" size="lg" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Sending…" : "Request final quote"}
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1">{children}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-sm font-medium text-accent underline underline-offset-4"
      >
        Change<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

// ── Step 7: Sent (§22 step 10, §26) ──────────────────────────────────────

function SentScreen({ snapshot, warning }: { snapshot: EnquirySnapshot; warning?: string }) {
  const message = buildWhatsAppMessage(snapshot);
  const { services } = useCatalogue();

  /**
   * Can this customer just book it themselves (§28)?
   *
   * Only when the basket is a single confirmed fixed-price service mapped to a
   * TechMan labour slot — `selfBookableSlot()` holds that rule, and the
   * reasoning for each part of it. Everything else waits for a human to price
   * it, which is the whole premise of this site and is not being relaxed here.
   */
  const slot = selfBookableSlot(snapshot.items, services);
  const bookHref = slot ? techmanBookingHref({ slot, registration: snapshot.registration }) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 pb-mobile-bar">
        <div className="mx-auto max-w-3xl px-4 py-14 lg:px-8 lg:py-20">
          {warning ? (
            <>
              <p className="eyebrow">Not quite</p>
              <h1 className="mt-3 text-3xl md:text-4xl">Send this to us on WhatsApp</h1>
              <p
                role="alert"
                className="mt-5 rounded-lg border border-status-monitor/50 bg-status-monitor-wash px-4 py-3 text-sm"
              >
                {warning}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-status-good-wash text-status-good">
                  <Check className="size-5" aria-hidden="true" />
                </span>
                <p className="eyebrow">Request sent</p>
              </div>
              <h1 className="mt-4 text-3xl md:text-4xl">
                Thanks{snapshot.name ? `, ${snapshot.name.split(" ")[0]}` : ""}, we've got it.
              </h1>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {snapshot.registration && (
                  <RegPlate registration={snapshot.registration} size="md" />
                )}
                <span className="rounded-md border border-border bg-secondary px-3 py-2 font-mono text-sm font-semibold">
                  {snapshot.reference}
                </span>
              </div>
              <p className="mt-5 text-lg text-muted-foreground">
                Quote that reference if you ring. We'll confirm the price for your exact car and let
                you know what we've got available, usually the same working day.
              </p>
            </>
          )}

          {/* What happens next, stated plainly. The gap between "sent" and
              "heard back" is where people worry, so it gets answered here
              rather than left to imagination. */}
          <ol className="mt-8 space-y-3 border-l-2 border-border pl-5">
            {[
              "We check your registration and work out exactly which parts your car takes.",
              "You get a firm price, on WhatsApp unless you'd rather we rang.",
              techmanPortalConfigured()
                ? "Happy with it? We send the estimate over as a link you can approve and pay online. Nothing is booked until you do."
                : "If you're happy, we agree a date. Nothing is booked until you say so.",
            ].map((line, index) => (
              <li key={line} className="relative text-sm text-muted-foreground">
                <span
                  className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
                <span className="font-medium text-foreground">Step {index + 1}.</span> {line}
              </li>
            ))}
          </ol>

          {/* The self-service door (§28). Rendered only for a single confirmed
              fixed-price job, so a customer never books a slot at a price we
              would have to revise once we saw the car. */}
          {bookHref && (
            <div className="mt-8 rounded-lg border border-accent/40 bg-accent-wash p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold">This one you can just book</h2>
              <p className="mt-2 text-muted-foreground">
                The price for this job is fixed, so there's nothing for us to work out. Pick a time
                that suits you and it goes straight into the diary.
              </p>
              <div className="mt-4">
                <Button asChild size="lg">
                  <a
                    href={bookHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent("booking_link_sent", {
                        itemId: slot ?? undefined,
                        meta: { from: "quote-sent" },
                      })
                    }
                  >
                    Book this now
                  </a>
                </Button>
              </div>
            </div>
          )}

          <div className="mt-8 rounded-lg border border-border bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-semibold">Want an answer faster?</h2>
            <p className="mt-2 text-muted-foreground">
              Send this straight through on WhatsApp. Everything you've told us is already written
              out. You only need to press send.
            </p>
            <div className="mt-4">
              <WhatsAppButton
                message={message}
                label="Continue on WhatsApp"
                size="lg"
                source="quote-sent"
              />
            </div>
          </div>

          <details className="mt-6 rounded-lg border border-border p-5">
            <summary className="cursor-pointer font-medium">See what we've got</summary>
            <pre className="mt-4 overflow-x-auto rounded bg-secondary p-4 text-sm whitespace-pre-wrap">
              {message}
            </pre>
          </details>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-8">
            <Button asChild variant="outline">
              <Link to="/">Back to the site</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft();
                window.location.assign("/quote");
              }}
            >
              Start another request
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
