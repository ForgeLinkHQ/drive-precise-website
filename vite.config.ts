import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

/**
 * Security headers, applied where they are actually guaranteed to reach a
 * visitor.
 *
 * They also live in `vercel.json`, and that is not where they take effect. This
 * project builds through the Build Output API — `npm run build` writes
 * `.vercel/output/config.json` — and Nitro generates that file itself, with
 * exactly three routes and one cache-control rule for `/assets`. Nothing from
 * `vercel.json` appears in it. So the whole set was being written down and, on
 * the evidence of the build output, not served.
 *
 * Declaring them as Nitro route rules puts them in the generated config, which
 * is the file Vercel routes from. `vercel.json` stays as it is: harmless,
 * belt-and-braces, and correct if this ever stops using the Build Output API.
 *
 * `security-headers.test.ts` asserts the two agree, because two copies of a
 * policy is how one of them quietly becomes wrong.
 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    // The Portal embeds this site in the website editor. Nothing else may.
    "frame-ancestors 'self' https://forgelink-portal.vercel.app https://*.forgelink.co",
    "upgrade-insecure-requests",
  ].join("; "),
} as const;

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "vercel",
      routeRules: {
        "/**": { headers: { ...SECURITY_HEADERS } },
      },
    }),
    react(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
});
