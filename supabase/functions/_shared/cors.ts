/**
 * CORS for this project's edge functions.
 *
 * The Portal calls these from a browser on a different origin, so preflight has
 * to be answered before anything else runs.
 */

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Returns a response for a preflight request, or null for a real one. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The same headers, plus one the default list has no reason to mention.
 *
 * Stripe signs every delivery and sends the signature in `stripe-signature`.
 * A preflight that does not name it fails the webhook before the handler is
 * reached, and the symptom is a webhook that silently never fires.
 */
export function corsHeadersWith(extra: string): Record<string, string> {
  return {
    ...corsHeaders,
    "Access-Control-Allow-Headers": `${ALLOWED_HEADERS}, ${extra}`,
  };
}
