import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { whatsappConfigured } from "@/lib/business";
import { whatsappGeneralHref, whatsappHref } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp CTA.
 *
 * Renders nothing when no number is configured. A "WhatsApp us" button that
 * opens wa.me with a placeholder number is worse than no button — it looks
 * like the business ignores messages.
 */
export function WhatsAppButton({
  message,
  context,
  label = "WhatsApp us",
  className,
  size = "md",
  block,
  source,
}: {
  /** A fully-built message. Overrides `context`. */
  message?: string;
  /** A topic, for the generic "I have a question about X" opener. */
  context?: string;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  /** Where the click came from, for the funnel. */
  source?: string;
}) {
  if (!whatsappConfigured()) return null;

  const href = message ? whatsappHref(message) : whatsappGeneralHref(context);

  return (
    <Button
      asChild
      variant="whatsapp"
      size={size}
      block={block}
      className={cn(className)}
      onClick={() => trackEvent("whatsapp_clicked", { meta: source ? { source } : undefined })}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}
