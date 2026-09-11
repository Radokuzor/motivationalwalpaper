// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// The production origin. Used for canonical URLs, sitemap, and robots.txt.
// Change this if the site ships on a different domain.
const SITE = 'https://motivationalwallpaper.com';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Astro 5 dropped `hybrid`: `output: 'static'` (the default) prerenders every
  // page, and a route opts into on-demand rendering with `export const
  // prerender = false` — currently just `src/pages/api/survey.ts`, which runs as
  // a Vercel serverless function.
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'never',
  integrations: [
    sitemap({
      // Exclude every route that still ships `noindex` (skeleton pages) or is
      // otherwise not meant to be crawled. Real content (`/`, `/about`,
      // `/blog`, `/blog/*`) is indexable and listed. As a skeleton page earns
      // real content and drops `noindex`, drop its prefix here too.
      filter: (page) => {
        const path = page.replace(SITE, '') || '/';
        const NOINDEX_PREFIXES = ['/home', '/gallery', '/quiz', '/submit', '/iphone-wallpapers', '/api'];
        if (path === '/404') return false;
        return !NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      },
    }),
  ],
  build: {
    // one .html per route, at /route/index.html -> served as /route
    format: 'directory',
  },
});
