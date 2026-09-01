import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";

import { securityRouteRules } from "./scripts/security-headers.mjs";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "vercel",
      // The headers written in vercel.json, served. This build goes out through
      // Vercel's Build Output API, and the config Nitro generates for it carries
      // nothing from vercel.json — so the policy is read from that file here
      // and handed to Nitro as route rules. See scripts/security-headers.mjs.
      routeRules: securityRouteRules(fileURLToPath(new URL(".", import.meta.url))),
    }),
    react(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
});
