import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { MobileBar } from "@/components/site/mobile-bar";
import { StickyQuoteBar } from "@/components/site/sticky-quote-bar";
import { CookieNotice } from "@/components/site/cookie-notice";
import { BUSINESS } from "@/lib/business";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${BUSINESS.legalName} | ${BUSINESS.descriptor}` },
      {
        name: "description",
        content:
          "BMW servicing, maintenance and repairs at your home or workplace. Independent mobile BMW specialist covering Hampshire and Surrey. Build your quote online in a couple of minutes.",
      },
      { name: "theme-color", content: "#1B2A4A" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  usePageViews();

  return (
    <QueryClientProvider client={queryClient}>
      {/* A skip link is the cheapest accessibility win there is, and this site
          has a long header nav to skip past on every page (§49). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Outlet />
      <StickyQuoteBar />
      <MobileBar />
      <CookieNotice />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}

/**
 * One page_view per page, including client-side navigations.
 *
 * Subscribed to the router rather than fired from each route, so a page added
 * later is counted without anyone remembering to instrument it — the failure
 * mode of per-page tracking is a funnel with a silent hole in it.
 */
function usePageViews() {
  const router = useRouter();

  useEffect(() => {
    trackEvent("page_view");
    return router.subscribe("onResolved", ({ fromLocation, toLocation }) => {
      // The router resolves on every state change, including a search-param
      // update on the same page; only a real path change is a new page.
      if (fromLocation?.pathname === toLocation.pathname) return;
      trackEvent("page_view");
    });
  }, [router]);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="max-w-md text-center">
          <p className="eyebrow">404</p>
          <h1 className="mt-4 text-4xl">Page not found</h1>
          <p className="mt-4 text-muted-foreground">
            This page has moved, or was never here. If you were looking for a particular job, the
            services list is the fastest way to find it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <a href="/services">View services</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/">Go home</a>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="max-w-md text-center">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="mt-4 text-3xl">This page didn't load</h1>
          <p className="mt-4 text-muted-foreground">
            Try again, or give us a ring. We'd rather hear from you than have you fight with a
            website.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                router.invalidate();
                reset();
              }}
            >
              Try again
            </Button>
            <Button asChild variant="outline">
              <a href="/contact">Contact us</a>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
