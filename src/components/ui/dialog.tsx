import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Modal and sheet, on Radix.
 *
 * Every overlay on this site goes through here, and the reason is the list of
 * things a hand-rolled `<div role="dialog">` gets wrong: focus is never
 * trapped, Escape does nothing, the page behind keeps scrolling, focus is not
 * returned to whatever opened it, and the rest of the page is still exposed to
 * a screen reader. The admin enquiry panel was exactly that div, and on a
 * phone it was genuinely difficult to close.
 *
 * `side` turns the same primitive into a sheet — the mobile menu and the
 * basket drawer are both sheets, and sharing one implementation means they
 * share one set of correct behaviours.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-[oklch(0.15_0.03_265_/_55%)] backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  side = "center",
  showClose = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "center" | "right" | "bottom";
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-panel outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "center" && [
            "top-1/2 left-1/2 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border",
            "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          ],
          side === "right" && [
            "inset-y-0 right-0 w-[min(22rem,88vw)] border-l border-border",
            "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          ],
          side === "bottom" && [
            // dvh, not vh: on iOS the address bar collapses and a vh-sized
            // sheet ends up taller than the visible viewport, hiding its own
            // footer behind the browser chrome.
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "pb-[env(safe-area-inset-bottom,0px)]",
          ],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="tap absolute top-3 right-3 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("shrink-0 border-b border-border px-5 py-4 pr-14 sm:px-6", className)}
      {...props}
    />
  );
}

/** The scrolling middle. Header and footer stay put; only this moves. */
export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border px-5 py-4 sm:px-6",
        "flex flex-wrap gap-3",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-xl font-semibold", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
