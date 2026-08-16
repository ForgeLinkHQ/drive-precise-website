import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { CATEGORY_BLURB, CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_SLUG } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * The desktop navigation, with a services mega-panel.
 *
 * A main dealer opens its services menu and shows you the whole department at
 * once, because the visitor does not yet know the name of the thing they came
 * for. That is exactly this customer's problem (§3), so the panel shows all six
 * categories with a line of plain English under each, plus the two entry points
 * that aren't categories: packages, and "not sure what you need".
 *
 * Radix rather than a hand-rolled hover panel: it handles the parts that are
 * tedious and that everyone gets wrong — Escape to close, arrow keys between
 * items, the pointer-leave grace period so the menu doesn't snap shut when the
 * cursor crosses a gap, and focus returning to the trigger.
 */

const LINKS = [
  { to: "/checks", label: "Checks & Inspections" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/trade", label: "Trade" },
  { to: "/about", label: "About" },
] as const;

const PANEL_ITEM = "group block rounded-lg p-3 transition-colors hover:bg-secondary";

const triggerClass =
  "inline-flex items-center gap-1 rounded-md px-1 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-accent data-[state=open]:text-accent";

export function MainNav() {
  return (
    <NavigationMenu.Root className="relative hidden xl:flex" delayDuration={80}>
      <NavigationMenu.List className="flex items-center gap-6">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={triggerClass}>
            Services
            <ChevronDown
              className="size-3.5 transition-transform duration-150 group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </NavigationMenu.Trigger>

          <NavigationMenu.Content
            className={cn(
              "absolute top-full left-0 w-[46rem] pt-3",
              "data-[motion=from-start]:animate-in data-[motion=from-end]:animate-in",
              "data-[motion=to-start]:animate-out data-[motion=to-end]:animate-out",
            )}
          >
            <div className="rounded-xl border border-border bg-popover p-4 shadow-panel">
              <ul className="grid grid-cols-2 gap-1">
                {CATEGORY_ORDER.map((category) => (
                  <li key={category}>
                    <NavigationMenu.Link asChild>
                      {/* Checks has a proper landing page of its own, which
                          answers the question far better than the bare
                          category listing. Two menu entries reading
                          "Checks & Inspections" and going to different pages
                          is a coin flip for the customer, so both go to the
                          better one. */}
                      {category === "checks" ? (
                        <Link to="/checks" className={PANEL_ITEM}>
                          <span className="block text-sm font-semibold group-hover:text-accent">
                            {CATEGORY_LABEL[category]}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {CATEGORY_BLURB[category]}
                          </span>
                        </Link>
                      ) : (
                        <Link
                          to="/services/$category"
                          params={{ category: CATEGORY_SLUG[category] }}
                          className={PANEL_ITEM}
                        >
                          <span className="block text-sm font-semibold group-hover:text-accent">
                            {CATEGORY_LABEL[category]}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {CATEGORY_BLURB[category]}
                          </span>
                        </Link>
                      )}
                    </NavigationMenu.Link>
                  </li>
                ))}
              </ul>

              <div className="mt-3 grid grid-cols-2 gap-1 border-t border-border pt-3">
                <NavigationMenu.Link asChild>
                  <Link
                    to="/services"
                    className="group block rounded-lg p-3 transition-colors hover:bg-secondary"
                  >
                    <span className="block text-sm font-semibold group-hover:text-accent">
                      Every service, with prices
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      The full list in one page.
                    </span>
                  </Link>
                </NavigationMenu.Link>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/packages"
                    className="group block rounded-lg p-3 transition-colors hover:bg-secondary"
                  >
                    <span className="block text-sm font-semibold group-hover:text-accent">
                      Packages
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Cheaper than the same work booked separately.
                    </span>
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        {LINKS.map((link) => (
          <NavigationMenu.Item key={link.to}>
            <NavigationMenu.Link asChild>
              <Link
                to={link.to}
                className="text-sm font-medium text-foreground/75 transition-colors hover:text-accent"
                activeProps={{ className: "text-accent" }}
              >
                {link.label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}
