/**
 * Client-side fetch for each world's "preferred" wallpaper photo — the real
 * image an operator uploaded on /submit and marked as a category's hero,
 * replacing that world's CSS-gradient placeholder. Progressive enhancement
 * only: any failure (no preferred asset yet, network error) resolves to `{}`
 * and every caller keeps rendering the gradient.
 */
import type { WorldKey } from '../data/worlds';

export interface HeroAsset {
  id: string;
  thumbUrl: string;
  originalUrl: string;
}

export type HeroMap = Partial<Record<WorldKey, HeroAsset>>;

let cached: Promise<HeroMap> | null = null;

/** Fetched once per page load and shared by every island that asks. */
export function getHeroMap(): Promise<HeroMap> {
  if (!cached) {
    cached = fetch('/api/wallpapers?hero=1')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => (data && typeof data === 'object' ? (data as HeroMap) : {}))
      .catch(() => ({}) as HeroMap);
  }
  return cached;
}
