import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Phone } from "lucide-react";

import { RegPlateInput } from "@/components/site/reg-plate";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business";
import { telHref } from "@/lib/contact-links";
import { setVehicle, useQuoteDraft } from "@/lib/basket";
import { isPlausibleRegistration, normaliseRegistration } from "@/lib/vehicle";
import { trackEvent } from "@/lib/analytics";

/**
 * The homepage hero.
 *
 * A dealer site opens dark and asks for your registration. So does this — but
 * where a dealer asks in order to put you into a finance funnel, this asks
 * because the registration is genuinely what makes a price accurate rather
 * than a guess, and the copy says exactly that.
 *
 * The plate is the primary action, not a decorative flourish. Typing a
 * registration here and pressing the button lands the customer on step two of
 * the builder with step one already done, which removes the single most common
 * reason people abandon a quote form: being asked to start.
 *
 * Trust points sit inside the dark band rather than in a separate strip below
 * it. On a dealer site those claims are the badge wall; here they are five
 * short factual statements, every one of which Drive Precise can support.
 */

const TRUST = [
  "BMW-trained",
  "We come to you",
  "Collection available",
  "Clear vehicle-specific quotes",
  "Evidence, never scare stories",
];

export function Hero() {
  const navigate = useNavigate();
  const draft = useQuoteDraft();
  const [reg, setReg] = useState(draft.vehicle.registration);
  const [touched, setTouched] = useState(false);

  const normalised = normaliseRegistration(reg);
  const looksWrong = touched && normalised.length > 0 && !isPlausibleRegistration(normalised);

  const start = () => {
    setTouched(true);
    if (!normalised) return;
    setVehicle({ registration: normalised });
    trackEvent("builder_started", { meta: { from: "hero-plate" } });
    void navigate({ to: "/quote" });
  };

  return (
    <section className="band-deep on-deep">
      <div className="shell grid gap-10 py-14 lg:grid-cols-12 lg:gap-12 lg:py-24">
        <div className="lg:col-span-7 lg:pr-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
            {BUSINESS.descriptor}
          </p>

          <h1 className="mt-5 text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
            The BMW specialist that comes to your driveway.
          </h1>

          <p className="muted-on-deep mt-6 max-w-xl text-lg leading-relaxed">
            Servicing, brakes, suspension and repairs, done properly at your home or your workplace
            across Surrey and north-east Hampshire. Where a job genuinely needs a ramp, we collect
            the car and bring it back.
          </p>

          <p className="mt-5 font-display text-xl font-semibold">Car care without the guesswork.</p>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
            {TRUST.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href={telHref(BUSINESS.phone)}
              className="inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
              onClick={() => trackEvent("whatsapp_clicked", { meta: { source: "hero-call" } })}
            >
              <Phone className="size-4" aria-hidden="true" />
              {BUSINESS.phone}
            </a>
            <span className="muted-on-deep text-sm">
              Or just{" "}
              <Link to="/services" className="underline underline-offset-4">
                look through what we do
              </Link>
              .
            </span>
          </div>
        </div>

        {/* The plate card. Given its own surface so it reads as the thing to
            do, rather than as one element among several on the dark band. */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-[var(--color-deep-rule)] bg-[oklch(1_0_0_/_6%)] p-6 backdrop-blur-sm sm:p-7">
            <h2 className="font-display text-xl font-semibold">Start with your registration</h2>
            <p className="muted-on-deep mt-2 text-sm leading-relaxed">
              It tells us which parts your car takes, which is the difference between a real price
              and a guess. Nothing else needed yet — no name, no phone number.
            </p>

            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                start();
              }}
            >
              <RegPlateInput
                value={reg}
                onChange={setReg}
                onBlur={() => setTouched(true)}
                label="Your registration"
                size="lg"
                error={
                  looksWrong
                    ? "That doesn't look like a UK registration. Have another look."
                    : touched && !normalised
                      ? "Pop your registration in and we'll take it from there."
                      : undefined
                }
                className="[&>label]:text-[var(--color-deep-foreground)]"
              />

              <Button type="submit" size="lg" variant="accent" block className="mt-5">
                Build my quote
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-5 flex flex-col gap-3 border-t border-[var(--color-deep-rule)] pt-5">
              <p className="muted-on-deep text-sm">
                Rather just ask a question? Send us a photo or a video of the noise — it beats
                trying to describe it.
              </p>
              <WhatsAppButton label="Message us on WhatsApp" block source="hero" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
