/**
 * The database side of the Portal integration, checked against the migrations.
 *
 * §60 says internal cost data never reaches a browser. On the public site that
 * is enforced three ways — `toPublicService()` strips it, `get_public_services()`
 * names its columns, and no policy admits anon to the table.
 *
 * None of that survives contact with the Portal. It reads this database with a
 * service role key, which ignores row-level security completely, and its table
 * proxy selects every column when a page does not name them. So the rule is
 * only as good as the function the Portal is made to read instead — which makes
 * that function's column list a security boundary, and worth a test that fails
 * the build rather than a comment somebody edits past.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS = resolve(__dirname, "../../supabase/migrations");

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = files.map((f) => ({
  file: f,
  body: readFileSync(resolve(MIGRATIONS, f), "utf8"),
}));

const all = sql.map((s) => s.body).join("\n");

function functionBodies(): Array<{ file: string; name: string; body: string }> {
  const out: Array<{ file: string; name: string; body: string }> = [];
  for (const { file, body } of sql) {
    const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\$\$;/gi;
    for (const m of body.matchAll(re)) {
      out.push({ file, name: m[1].toLowerCase(), body: m[0] });
    }
  }
  return out;
}

const functions = functionBodies();

/** The columns §60 exists to keep out of a browser. */
const INTERNAL_COLUMNS = ["parts_cost_gbp", "consumables_cost_gbp", "internal_notes"];

describe("§60 — internal cost data never reaches a browser", () => {
  it("finds the admin catalogue function", () => {
    expect(functions.map((f) => f.name)).toContain("get_admin_services");
  });

  it("keeps cost columns out of get_admin_services", () => {
    // The Portal reads the catalogue through this and only this — `services`
    // is refused to the proxy outright. Adding a cost column here would put
    // margin in the browser of everyone with an org membership, which includes
    // `staff` and `readonly`. A margin view belongs in a separate, owner-gated
    // function, not appended to this list.
    const fn = functions.find((f) => f.name === "get_admin_services")!;
    for (const column of INTERNAL_COLUMNS) {
      expect(fn.body.toLowerCase(), `get_admin_services exposes ${column}`).not.toContain(column);
    }
  });

  it("keeps cost columns out of the public catalogue function too", () => {
    const fn = functions.find((f) => f.name === "get_public_services");
    expect(fn, "get_public_services not found").toBeDefined();
    for (const column of INTERNAL_COLUMNS) {
      expect(fn!.body.toLowerCase()).not.toContain(column);
    }
  });

  it("never grants anon a look at the services table", () => {
    // The table itself carries the cost columns. A table-level grant covers
    // every column including ones added later, which is exactly how a private
    // column becomes public without anyone editing a policy.
    const grants = [
      ...all.matchAll(/grant\s+([a-z, ]+)\s+on\s+(?:table\s+)?public\.services\s+to([^;]*);/gi),
    ];
    for (const g of grants) {
      expect(g[2].toLowerCase(), "services granted to anon").not.toContain("anon");
    }
  });
});

describe("definer functions", () => {
  it("finds some to check", () => {
    expect(functions.length).toBeGreaterThan(10);
  });

  it("pins search_path on every SECURITY DEFINER function", () => {
    // A definer function runs with its owner's rights. Leaving search_path to
    // the caller lets them put their own table in front of the real one and
    // have a privileged function operate on it instead.
    const unpinned = functions
      .filter((f) => /security\s+definer/i.test(f.body))
      .filter((f) => !/set\s+search_path\s*=/i.test(f.body))
      .map((f) => `${f.file}: ${f.name}`);

    expect(unpinned).toEqual([]);
  });
});

describe("the draft and publish flow", () => {
  it("keeps unpublished copy away from the site's public key", () => {
    // The anon key ships in the browser bundle. A table-level SELECT grant on
    // site_content would cover `draft_value` — every unpublished price and line
    // of copy, readable by anyone who opens devtools. The grant names its
    // columns for exactly this reason.
    const grant = all.match(
      /grant\s+select\s*\(([^)]*)\)\s*\n?\s*on\s+public\.site_content\s+to([^;]*);/i,
    );
    expect(grant, "site_content has no column-level SELECT grant").not.toBeNull();
    expect(grant![1].toLowerCase()).not.toContain("draft_value");
  });

  it("lets only the service role publish", () => {
    // Publishing moves copy live. A readonly org member reaching this would be
    // able to push text onto the public site.
    for (const fn of ["publish_site_changes", "discard_site_changes", "create_preview_token"]) {
      const grants = [
        ...all.matchAll(
          new RegExp(
            `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]{0,80}?to([^;]*);`,
            "gi",
          ),
        ),
      ].map((m) => m[1].toLowerCase());

      expect(grants.length, `no GRANT for ${fn}`).toBeGreaterThan(0);
      for (const to of grants) {
        expect(to, `${fn} reachable beyond service_role`).not.toContain("anon");
        expect(to).toContain("service_role");
      }
    }
  });
});

describe("the enquiry pipeline", () => {
  it("will not record a quoted status without a quote", () => {
    // A row marked `quoted` with no figure averages into nothing and reads as a
    // broken report rather than as missing data. The function refuses the
    // combination so the report can never be asked to average a number nobody
    // gave.
    const fn = functions.find((f) => f.name === "update_enquiry_status");
    expect(fn, "update_enquiry_status not found").toBeDefined();
    expect(fn!.body).toContain("quote_required_for_status");
    expect(fn!.body).toContain("lost_reason_required");
  });

  it("queues owner alerts rather than sending from a trigger", () => {
    // A trigger that calls out over the network makes a customer's INSERT
    // depend on an email provider being reachable. The enquiry must land even
    // when nothing can be sent about it.
    const triggers = all.match(/create\s+trigger\s+enquiries_alert_owner[\s\S]{0,200}/i);
    expect(triggers, "no enquiry alert trigger").not.toBeNull();
    expect(triggers![0].toLowerCase()).toContain("alert_on_new_enquiry");

    const fn = functions.find((f) => f.name === "alert_on_new_enquiry");
    expect(fn!.body.toLowerCase()).toContain("enqueue_owner_alert");
    expect(fn!.body.toLowerCase()).not.toContain("net.http_post");
  });
});
