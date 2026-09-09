/**
 * SEO landing-page themes -> /iphone-wallpapers/<slug>
 *
 * The strategy brief's quick wins: dedicated landing pages for terms the domain
 * can rank for (iphone-specific, low KD). This file is the route source for
 * pages/iphone-wallpapers/[theme].astro.
 *
 * ⚠️ All copy below is PLACEHOLDER. Real keyword-researched H1s, intros and FAQ
 * answers are a later content pass — see 01_strategy_brief.md "Traffic growth
 * priorities". Structure (H1 + intro + grid + FAQ + JSON-LD + canonical) is what
 * this pass locks in.
 */

import type { WorldKey } from './worlds';

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoTheme {
  slug: string;
  /** <title> */
  title: string;
  /** on-page <h1> */
  h1: string;
  /** <meta name="description"> */
  description: string;
  /** opening paragraph */
  intro: string;
  /** worlds whose art to show in the grid */
  worlds: WorldKey[];
  faqs: SeoFaq[];
}

const FAQ_STUB: SeoFaq[] = [
  {
    q: 'Are these iPhone wallpapers free?',
    a: 'PLACEHOLDER — yes, the first wallpaper is free; describe the capture step here.',
  },
  {
    q: 'What size are the wallpapers?',
    a: 'PLACEHOLDER — 1290×2796 (iPhone 15/16 Pro), safe down to 1170×2532.',
  },
  {
    q: 'How do I set a wallpaper on my iPhone lock screen?',
    a: 'PLACEHOLDER — short step-by-step for Settings → Wallpaper → Add New Wallpaper.',
  },
];

export const SEO_THEMES: SeoTheme[] = [
  {
    slug: 'motivational',
    title: 'Motivational iPhone Wallpapers — motivationalwallpaper.com',
    h1: 'Motivational iPhone Wallpapers',
    description:
      'PLACEHOLDER — a daily identity anchor for your lock screen. Pick a look, send it to your phone.',
    intro:
      'PLACEHOLDER intro paragraph. Who this is for, what makes these different from a quote dump, and the one-line promise.',
    worlds: ['stoic', 'builder', 'rebuild', 'soft', 'scripture', 'aesthetic'],
    faqs: FAQ_STUB,
  },
  {
    slug: 'stoic',
    title: 'Stoic iPhone Wallpapers — motivationalwallpaper.com',
    h1: 'Stoic iPhone Wallpapers',
    description: 'PLACEHOLDER — matte, disciplined lock screens. Forged, not decorated.',
    intro: 'PLACEHOLDER intro for the Stoic world — resolve, the silent grind, no one watching.',
    worlds: ['stoic', 'builder'],
    faqs: FAQ_STUB,
  },
  {
    slug: 'christian',
    title: 'Christian iPhone Wallpapers & Bible Verse Backgrounds — motivationalwallpaper.com',
    h1: 'Christian iPhone Wallpapers',
    description: 'PLACEHOLDER — scripture as daily armor. Beautiful enough to forward.',
    intro: 'PLACEHOLDER intro for the Scripture world — steadiness, the Word, carry this with you.',
    worlds: ['scripture', 'rebuild'],
    faqs: FAQ_STUB,
  },
  {
    slug: 'aesthetic',
    title: 'Aesthetic iPhone Wallpapers — motivationalwallpaper.com',
    h1: 'Aesthetic iPhone Wallpapers',
    description: 'PLACEHOLDER — soft, cozy, it’s-giving lock screens with a quiet affirmation.',
    intro: 'PLACEHOLDER intro for the Aesthetic / Soft Life worlds — ease, glow, a new era.',
    worlds: ['aesthetic', 'soft'],
    faqs: FAQ_STUB,
  },
  {
    slug: 'builder',
    title: 'Entrepreneur & Builder iPhone Wallpapers — motivationalwallpaper.com',
    h1: 'Builder iPhone Wallpapers',
    description: 'PLACEHOLDER — dark-and-gold lock screens for the people building in the quiet.',
    intro: 'PLACEHOLDER intro for the Builder world — momentum, execute, next chapter.',
    worlds: ['builder', 'stoic'],
    faqs: FAQ_STUB,
  },
  {
    slug: 'soft-life',
    title: 'Soft Life iPhone Wallpapers — motivationalwallpaper.com',
    h1: 'Soft Life iPhone Wallpapers',
    description: 'PLACEHOLDER — blush, cream and taupe lock screens for beginning again.',
    intro: 'PLACEHOLDER intro for the Soft Life world — possibility, bloom, intentional.',
    worlds: ['soft', 'aesthetic'],
    faqs: FAQ_STUB,
  },
];

export function seoThemeBySlug(slug: string): SeoTheme | undefined {
  return SEO_THEMES.find((t) => t.slug === slug);
}
