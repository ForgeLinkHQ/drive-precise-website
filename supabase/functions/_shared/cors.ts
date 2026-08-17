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
