import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Deliberately separate from vite.config.ts: the TanStack Start and Nitro
// plugins there are build-only and break under the vitest runner.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
