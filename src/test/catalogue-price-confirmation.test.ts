import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const catalogue = read("src/lib/service-catalog.ts");
const migration = read("supabase/migrations/20260906000000_public_price_confirmation.sql");

describe("catalogue price confirmation contract", () => {
  it("publishes the approval bit for services without publishing cost data", () => {
    const serviceFunction = migration.slice(
      migration.indexOf("CREATE FUNCTION public.get_public_services"),
      migration.indexOf("DROP FUNCTION IF EXISTS public.get_public_packages"),
    );
    expect(serviceFunction).toMatch(/price_confirmed\s+BOOLEAN/);
    expect(serviceFunction).toMatch(/s\.price_confirmed/);
    expect(serviceFunction).not.toMatch(/parts_cost_gbp/);
    expect(serviceFunction).not.toMatch(/consumables_cost_gbp/);
    expect(serviceFunction).not.toMatch(/internal_notes/);
  });

  it("publishes the approval bit for packages too", () => {
    const packageFunction = migration.slice(
      migration.indexOf("CREATE FUNCTION public.get_public_packages"),
    );
    expect(packageFunction).toMatch(/price_confirmed\s+BOOLEAN/);
    expect(packageFunction).toMatch(/p\.price_confirmed/);
  });

  it("maps the database approval instead of forcing it back to false", () => {
    expect(catalogue).toMatch(/priceConfirmed: row\.price_confirmed === true/);
    expect(catalogue).not.toMatch(/priceConfirmed: false/);
  });
});
