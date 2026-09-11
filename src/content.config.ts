/**
 * Content collections — Astro 5 content-layer config.
 *
 * `blog` powers /blog: motivation / self-help / discipline articles that
 * exist to rank for search intent adjacent to the product (see
 * 01_strategy_brief.md "Traffic growth priorities" — hub pages as AI
 * citation magnets), not just "wallpaper" queries. Each post can point at a
 * `relatedWorld` (a WorldKey from src/data/worlds.ts) for the in-article CTA.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    /** <meta name="description"> + card excerpt. ~150-160 chars. */
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** Section label shown on the card + post (e.g. "Discipline", "Faith"). */
    category: z.string(),
    /** WorldKey this post's in-article CTA routes to, e.g. 'stoic'. */
    relatedWorld: z.string().optional(),
    /** Rendered as FAQPage JSON-LD when present — AI Overview / citation bait. */
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { blog };
