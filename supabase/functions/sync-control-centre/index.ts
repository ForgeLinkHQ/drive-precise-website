import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTROL_CENTRE_URL = Deno.env.get("CONTROL_CENTRE_INGEST_URL");
const CONTROL_CENTRE_SECRET = Deno.env.get("CONTROL_CENTRE_INGEST_SECRET");

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.replace("Bearer ", "").trim() !== SERVICE_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await req.json();
    if (!CONTROL_CENTRE_URL || !CONTROL_CENTRE_SECRET) {
      console.warn(
        "[sync-control-centre] integration secrets are not configured",
      );
      return jsonResponse(
        { skipped: "control centre integration not configured" },
        200,
      );
    }
    const response = await fetch(CONTROL_CENTRE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONTROL_CENTRE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[sync-control-centre] forward failed (${response.status}): ${
          body.slice(0, 500)
        }`,
      );
      return jsonResponse(
        { error: "Control Centre forward failed", status: response.status },
        502,
      );
    }
    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    console.error("[sync-control-centre]", error);
    return jsonResponse({ error: "Unexpected forward failure" }, 500);
  }
});
