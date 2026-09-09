// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel/serverless';

// The production origin. Used for canonical URLs, sitemap, and robots.txt.
// Change this if the site ships on a different domain.
const SITE = 'https://motivationalwallpaper.com';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // `hybrid`: every page is prerendered to static HTML by default; only routes
  // that opt out (`export const prerender = false` — currently just
  // `src/pages/api/survey.ts`) run as Vercel serverless functions.
  output: 'hybrid',
  adapter: vercel(),
  trailingSlash: 'never',
  integrations: [
    sitemap({
      // Every route currently ships `noindex` except `/`, so the sitemap lists
      // only the homepage. As pages earn real content and drop `noindex`, add
      // them here (the `/iphone-wallpapers/*` set first).
      filter: (page) => page === `${SITE}/`,
    }),
  ],
  build: {
    // one .html per route, at /route/index.html -> served as /route
    format: 'directory',
  },
});
