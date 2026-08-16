/**
 * Services this visitor has looked at.
 *
 * People shopping for car work compare. They open a minor service, back out,
 * open a major service, back out, look at brakes — and then cannot find the
 * first one again. A short trail costs nothing and turns that into one tap.
 *
 * Stored on the device, capped, and holding nothing but catalogue ids: no
 * name, no registration, nothing that identifies anyone. That keeps it inside
 * what the cookie policy already describes as functional storage, and means
 * there is nothing here worth protecting if the device is shared.
 *
 * Same store pattern as the basket, and for the same reason: this app
 * server-renders, so the first client render must match the server's — which
 * means an empty list until an effect says otherwise.
 */

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "dp.recently-viewed.v1";
const MAX = 6;

const EMPTY: readonly string[] = [];

let snapshot: readonly string[] = EMPTY;
let hydrated = false;
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) fn();
}

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

function write(ids: readonly string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing and full quotas both throw. The trail is a convenience;
    // losing it must never surface to the customer.
  }
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

function getSnapshot(): readonly string[] {
  return snapshot;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

/** Record a visit. Called from the service page's effect, never during render. */
export function recordView(serviceId: string) {
  if (typeof window === "undefined" || !serviceId) return;
  hydrated = true;
  const next = [serviceId, ...read().filter((id) => id !== serviceId)].slice(0, MAX);
  snapshot = next;
  write(next);
  emit();
}

/**
 * The trail, most recent first.
 *
 * `exclude` drops the page you are already on — showing someone a shortcut
 * back to where they are standing is noise.
 */
export function useRecentlyViewed(exclude?: string): readonly string[] {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    const stored = read();
    if (stored.length > 0) {
      snapshot = stored;
      emit();
    }
  }, []);

  return exclude ? ids.filter((id) => id !== exclude) : ids;
}

/** Test seam. */
export function resetRecentlyViewed() {
  snapshot = EMPTY;
  hydrated = false;
}
