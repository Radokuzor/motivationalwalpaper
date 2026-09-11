/**
 * /rss.xml — blog feed. Helps discovery (feed readers, some SEO/AI crawlers
 * pick up RSS for freshness signals) beyond what the sitemap covers.
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
  );

  return rss({
    title: 'motivationalwallpaper.com — Blog',
    description:
      'Practical, honest writing on discipline, self-love, faith, healing, and staying motivated.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: `/blog/${post.id}`,
      categories: [post.data.category],
    })),
    customData: `<language>en-us</language>`,
  });
}
