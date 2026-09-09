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
