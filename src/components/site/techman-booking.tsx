import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { TECHMAN, techmanBookingConfigured, techmanIntegrateScriptUrl } from "@/lib/techman";

/**
 * The TechMan online booking widget (§28).
 *
 * TechMan's integration reference gives exactly one way to embed this: a
 * `<span id="tm-ob">` for the widget to find, and a loader script that pulls
 * `integrate.js` from the booking host. That script then renders the booking
 * flow into the span. This component is that snippet, made safe for an app that
 * server-renders and that promises to work with the network on fire.
 *
 * ── Three things this has to survive ──
 *
 * **Server rendering.** The snippet is `document.createElement` and friends, so
 * it cannot run during SSR. It goes in an effect, which only ever runs in a
 * browser. The markup rendered on the server and the markup rendered on the
 * client's first pass are identical — an empty span and a fallback link —
 * because `scripts/smoke.mjs` fails the build on any hydration warning.
 *
 * **The script never arriving.** A blocked CSP, an ad blocker, a TechMan outage
 * or a customer on a train all produce the same thing: a span that stays empty
 * forever. An empty box on a page headed "Book online" is a dead end, so the
 * standalone booking link is rendered *first*, always, and only hidden once the
 * widget has actually put something on the page. The link is the same one
 * TechMan's reference offers as its "standalone" method, so the customer
 * reaches an identical booking flow either way.
 *
 * **The smoke test.** It points every third-party host at nothing and fails on
 * any console error. So a failed load is a state this component handles, not an
 * exception it throws.
 *
 * ── Why `onload` is not enough ──
 *
 * The script firing `load` says TechMan's JavaScript arrived, not that it drew
 * anything. A MutationObserver on the mount point is what actually answers
 * "is there a booking form here now", which is the only question worth asking
 * before hiding the fallback.
 */
export function TechManBooking({
  /** Height of the embed. TechMan's reference suggests 460px; this needs more. */
  height = "760px",
  className,
}: {
  height?: string;
  className?: string;
}) {
  const mountRef = useRef<HTMLSpanElement | null>(null);
  const [state, setState] = useState<"idle" | "rendered" | "unavailable">("idle");

  useEffect(() => {
    const src = techmanIntegrateScriptUrl();
    const mount = mountRef.current;
    if (!src || !mount) return;

    trackEvent("booking_started");

    // Has the widget actually drawn? Cleared on unmount and once resolved, so
    // a customer who navigates away mid-load leaves nothing running.
    let settled = false;
    const settle = (next: "rendered" | "unavailable") => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      setState(next);
      if (next === "unavailable") trackEvent("booking_unavailable");
    };

    const observer = new MutationObserver(() => {
      if (mount.childNodes.length > 0) settle("rendered");
    });
    observer.observe(mount, { childList: true, subtree: true });

    // A ceiling, not a guess at TechMan's speed. If nothing has been drawn by
    // now the fallback link is the honest thing to show; if the widget arrives
    // later the observer still fires and the fallback steps aside.
    const timer = window.setTimeout(() => {
      if (mount.childNodes.length === 0) settle("unavailable");
    }, 8000);

    // TechMan's snippet, verbatim in behaviour: an async script inserted before
    // the first existing one. `document.location.protocol` is dropped — this
    // site is https-only and `upgrade-insecure-requests` is in the CSP, so the
    // http branch of their original could only ever produce a blocked request.
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = src;
    script.onerror = () => settle("unavailable");

    // These are the two globals `integrate.js` reads for its dimensions. They
    // are set on `window` rather than declared inline because this runs after
    // the document has parsed, so there is no inline scope left to share.
    const w = window as unknown as Record<string, unknown>;
    w.obUrl = TECHMAN.bookingUrl;
    w.obWidth = "100%";
    w.obHeight = height;

    const first = document.getElementsByTagName("script")[0];
    if (first?.parentNode) first.parentNode.insertBefore(script, first);
    else document.body.appendChild(script);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      script.remove();
    };
  }, [height]);

  if (!techmanBookingConfigured()) return null;

  return (
    <div className={className}>
      {/* Rendered on the server and on first hydration, so the two agree. Hidden
          only once the widget has genuinely drawn something. */}
      {state !== "rendered" && (
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">
            {state === "unavailable"
              ? "Our booking system isn't loading in this browser. It works fine in its own window — the link below goes to exactly the same booking form."
              : "Loading the booking calendar…"}
          </p>
          <div className="mt-4">
            <Button asChild variant={state === "unavailable" ? "primary" : "outline"}>
              <a href={TECHMAN.bookingUrl} target="_blank" rel="noopener noreferrer">
                Book in a new window
                <ExternalLink className="ml-2 size-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* The id TechMan's script looks for. Do not rename it.
          The height is reserved while there is still a chance the widget will
          draw into it, so its arrival does not shove the page around. Once the
          load has definitively failed the reservation is dropped — a screen of
          blank space under an apology reads as something else still broken. */}
      <span
        id="tm-ob"
        ref={mountRef}
        style={{ display: "block", minHeight: state === "unavailable" ? undefined : height }}
      />
    </div>
  );
}
