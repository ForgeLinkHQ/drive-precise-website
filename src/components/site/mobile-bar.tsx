import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, MessageCircle, Wrench } from "lucide-react";

import { BUSINESS, whatsappConfigured } from "@/lib/business";
import { whatsappGeneralHref } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/analytics";
import { useQuoteDraft } from "@/lib/basket";
import { cn } from "@/lib/utils";

/**
 * The persistent mobile bar (§52).
 *
 * Three destinations, because a fourth makes each target too narrow to hit
 * reliably one-handed, and these are the three the brief names: Services,
 * Quote, WhatsApp.
 *
 * It is hidden on the quote builder itself. The builder has its own sticky
 * footer carrying the basket total and the step's primary action, and two
 * stacked bars would eat a third of a phone screen at the exact moment the
 * customer is trying to read what they are being charged.
 */
export function MobileBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const draft = useQuoteDraft();

  if (pathname.startsWith("/quote") || pathname.startsWith("/admin")) return null;

  const count = draft.items.length;
  const hasWhatsApp = whatsappConfigured();

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 backdrop-blur lg:hidden",
        "pb-[env(safe-area-inset-bottom,0px)]",
      )}
    >
      <nav
        className={cn("mx-auto grid max-w-lg", hasWhatsApp ? "grid-cols-3" : "grid-cols-2")}
        aria-label="Quick actions"
      >
        <BarLink
          to="/services"
          icon={<Wrench className="size-5" aria-hidden="true" />}
          label="Services"
        />
        <BarLink
          to="/quote"
          icon={<ClipboardList className="size-5" aria-hidden="true" />}
          label="Get a quote"
          badge={count > 0 ? count : undefined}
        />
        {hasWhatsApp && (
          <a
            href={whatsappGeneralHref()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("whatsapp_clicked", { meta: { source: "mobile-bar" } })}
            className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground/80"
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            WhatsApp
            <span className="sr-only">Opens WhatsApp to message {BUSINESS.name}</span>
          </a>
        )}
      </nav>
    </div>
  );
}

function BarLink({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground/80"
      activeProps={{ className: "text-accent" }}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span
          className="absolute top-2 right-[calc(50%-1.6rem)] min-w-5 rounded-full bg-accent px-1.5 text-[10px] leading-5 text-accent-foreground"
          aria-label={`${badge} ${badge === 1 ? "item" : "items"} in your request`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
