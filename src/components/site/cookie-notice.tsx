import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "dp.cookie-notice-dismissed.v1";

/**
 * The cookie notice (§48).
 *
 * This site sets no advertising or tracking cookies. Analytics holds its
 * session key in memory for the life of the tab and stores nothing on the
 * device; the two things that *are* stored — your part-built quote, and the
 * fact you dismissed this notice — are strictly functional and exempt from the
 * consent requirement under PECR.
 *
 * So this is a notice, not a consent gate. There is no "reject" button because
 * there is nothing to reject, and offering one would imply an opt-out that
 * changes nothing. If a marketing or advertising cookie is ever added, this
 * component must be replaced with a real consent manager — that is a change of
 * legal position, not a change of copy.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(DISMISSED_KEY)) setVisible(true);
    } catch {
      // Storage unavailable. Showing the notice every visit is the safe side
      // of that failure.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      // bottom-20 on mobile keeps it clear of the fixed bottom bar; without it
      // the dismiss button sits underneath "WhatsApp" and cannot be pressed.
      className="fixed inset-x-0 bottom-[5.5rem] z-30 mx-auto max-w-3xl px-4 lg:bottom-4"
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-panel">
        <p className="text-sm leading-relaxed">
          We don't use advertising or tracking cookies. We store your part-built quote on your own
          device so you don't lose it, and we count visits without identifying anyone.{" "}
          <a href="/legal/cookies" className="underline underline-offset-4 hover:text-accent">
            Read the detail
          </a>
          .
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISSED_KEY, "1");
              } catch {
                // Nothing to do — the notice reappears next visit, which is
                // annoying but not broken.
              }
              setVisible(false);
            }}
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
