/**
 * Motivational quotes keyed by the "who inspires you" figures (src/data/quiz.ts).
 *
 * `quotes.json` is the canonical source — one entry per FigureOption.name, every
 * figure carrying >= 2 quotes. It feeds three places:
 *   - `scripts/seed-quotes.mjs` upserts it into Firestore (`figure_quotes/<slug>`)
 *   - `/api/survey` reads Firestore on completion, with this list as the fallback
 *   - `Quiz.astro` uses `pickQuoteForFigures` for an instant client-side fallback
 *
 * On completion the welcome banner shows one quote drawn at random from the
 * pooled quotes of every figure the visitor picked.
 */
import { STEPS } from './quiz';
import raw from './quotes.json';

export interface FigureQuote {
  /** the line shown on the welcome banner. */
  text: string;
  /** what renders after the em dash. */
  attribution: string;
}

export interface FigureQuoteSet {
  /** matches a FigureOption.name in STEPS "inspires". */
  figure: string;
  /** doc-id-safe slug — the Firestore doc id. */
  slug: string;
  quotes: FigureQuote[];
}

/**
 * `David Goggins` -> `david-goggins`. Kept in sync with the copy in
 * `scripts/seed-quotes.mjs` (that script can't import this TS module).
 */
export function quoteSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const FIGURE_QUOTES: FigureQuoteSet[] = (
  raw as Omit<FigureQuoteSet, 'slug'>[]
).map((s) => ({ ...s, slug: quoteSlug(s.figure) }));

const BY_FIGURE = new Map(FIGURE_QUOTES.map((s) => [s.figure, s]));

/** Every quote belonging to any of `names`, in pick order. */
export function quotesForFigures(names: string[]): FigureQuote[] {
  const pool: FigureQuote[] = [];
  for (const name of names) {
    const set = BY_FIGURE.get(name);
    if (set) pool.push(...set.quotes);
  }
  return pool;
}

/** A random quote from the pool of every chosen figure; `null` if none match. */
export function pickQuoteForFigures(names: string[]): FigureQuote | null {
  const pool = quotesForFigures(names);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Dev guard: every figure on the survey must carry at least two quotes.
if (import.meta.env?.DEV) {
  const inspires = STEPS.find((s) => s.id === 'inspires');
  const options = inspires && 'options' in inspires ? inspires.options : [];
  for (const opt of options) {
    const set = BY_FIGURE.get(opt.name);
    if (!set || set.quotes.length < 2) {
      console.warn(
        `[quotes] "${opt.name}" has ${set?.quotes.length ?? 0} quote(s); need >= 2`,
      );
    }
  }
}
