/**
 * Client-side cache of each category's real photo list
 * (`GET /api/wallpapers?world=<key>`) — shared by CategoryGrid so opening a
 * category reads from a warm cache instead of a fresh network round trip.
 *
 * `prefetchAllCategories()` is called once, early, to quietly fetch every
 * category's list in the background (browser idle time) so it's likely
 * already resolved by the time a visitor taps a category. `getCategoryPhotos`
 * is the single entry point either path uses — a request in flight or
 * already resolved is reused rather than re-fetched.
 */
import type { WorldKey } from '../data/worlds';

export interface CategoryPhoto {
  id: string;
  thumbUrl: string;
  originalUrl: string;
}

const cache = new Map<WorldKey, Promise<CategoryPhoto[]>>();

function fetchCategory(key: WorldKey): Promise<CategoryPhoto[]> {
  return fetch(`/api/wallpapers?world=${key}`)
    .then((res) => (res.ok ? res.json() : { items: [] }))
    .then((data: { items?: CategoryPhoto[] }) => data.items ?? [])
    .catch(() => []);
}

/** The given category's photo list — fetched once per page load and reused
 *  by every caller, whether that's a background prefetch or CategoryGrid
 *  opening right now. */
export function getCategoryPhotos(key: WorldKey): Promise<CategoryPhoto[]> {
  let p = cache.get(key);
  if (!p) {
    p = fetchCategory(key);
    cache.set(key, p);
  }
  return p;
}

/** Warm every category in the background once the browser is idle, so
 *  tapping one later is served from cache. Best-effort and low priority —
 *  never competes with anything the visitor is actively doing. */
export function prefetchAllCategories(keys: WorldKey[]): void {
  const run = () => keys.forEach((key) => getCategoryPhotos(key));
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
  } else {
    setTimeout(run, 300);
  }
}
