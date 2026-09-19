/**
 * User-agent parsing + known-bot matching — zero dependencies, server-side.
 *
 * Deliberately small and readable instead of pulling in ua-parser-js: this site
 * only needs the buckets the dashboard actually groups by (device class, OS,
 * browser) and a bot verdict with a *name*, so /admin can show which crawler it
 * was. Anything unrecognised degrades to 'Unknown' rather than guessing.
 *
 * Reality check that belongs next to this code: a crawler that never executes
 * JavaScript never reaches /api/analytics at all, so it can't be counted here.
 * What this catches is JS-executing traffic — headless browsers, preview
 * fetchers, AI agents, scrapers driving a real engine — plus anything that
 * announces itself honestly in the UA string.
 */

export type BotCategory =
  | 'search' // Googlebot, Bingbot… — indexing crawlers
  | 'ai' // GPTBot, ClaudeBot, PerplexityBot… — LLM crawlers/agents
  | 'seo' // Ahrefs, Semrush, Screaming Frog… — competitor/SEO tools
  | 'social' // facebookexternalhit, Twitterbot… — link preview fetchers
  | 'monitoring' // UptimeRobot, Pingdom, Lighthouse… — uptime/perf checks
  | 'library' // curl, python-requests, axios… — raw HTTP clients
  | 'headless' // HeadlessChrome, Puppeteer, Playwright, Selenium
  | 'other';

interface BotRule {
  re: RegExp;
  name: string;
  category: BotCategory;
}

/** Ordered — first match wins, so specific names precede generic patterns. */
const BOT_RULES: BotRule[] = [
  // ---- search engines ----
  { re: /googlebot|google-inspectiontool|storebot-google/i, name: 'Googlebot', category: 'search' },
  { re: /adsbot-google|mediapartners-google/i, name: 'Google Ads bot', category: 'search' },
  { re: /bingbot|adidxbot|msnbot/i, name: 'Bingbot', category: 'search' },
  { re: /duckduckbot|duckduckgo-favicons/i, name: 'DuckDuckBot', category: 'search' },
  { re: /yandex(bot|images|mobilebot)/i, name: 'YandexBot', category: 'search' },
  { re: /baiduspider/i, name: 'Baiduspider', category: 'search' },
  { re: /applebot-extended/i, name: 'Applebot-Extended', category: 'ai' },
  { re: /applebot/i, name: 'Applebot', category: 'search' },
  { re: /petalbot/i, name: 'PetalBot (Huawei)', category: 'search' },
  { re: /seznambot/i, name: 'SeznamBot', category: 'search' },
  { re: /naver|yeti\//i, name: 'Naver Yeti', category: 'search' },
  { re: /sogou|exabot|qwantify|mojeekbot|gigabot/i, name: 'Other search crawler', category: 'search' },

  // ---- AI / LLM crawlers and agents ----
  { re: /gptbot/i, name: 'GPTBot (OpenAI)', category: 'ai' },
  { re: /oai-searchbot/i, name: 'OAI-SearchBot (ChatGPT search)', category: 'ai' },
  { re: /chatgpt-user/i, name: 'ChatGPT-User (agent fetch)', category: 'ai' },
  { re: /claudebot|claude-web|claude-user|claude-searchbot|anthropic-ai/i, name: 'ClaudeBot (Anthropic)', category: 'ai' },
  { re: /perplexitybot|perplexity-user/i, name: 'PerplexityBot', category: 'ai' },
  { re: /google-extended/i, name: 'Google-Extended (Gemini)', category: 'ai' },
  { re: /bytespider/i, name: 'Bytespider (ByteDance)', category: 'ai' },
  { re: /ccbot/i, name: 'CCBot (Common Crawl)', category: 'ai' },
  { re: /amazonbot/i, name: 'Amazonbot', category: 'ai' },
  { re: /meta-externalagent|meta-externalfetcher|facebookbot/i, name: 'Meta AI crawler', category: 'ai' },
  { re: /cohere-ai|cohere-training-data-crawler/i, name: 'Cohere crawler', category: 'ai' },
  { re: /diffbot|omgili|timpibot|youbot|ai2bot|imagesiftbot|webzio/i, name: 'Other AI crawler', category: 'ai' },
  { re: /mistralai-user|deepseek|duckassistbot/i, name: 'Other AI agent', category: 'ai' },

  // ---- SEO / competitive-intel tools ----
  { re: /ahrefsbot|ahrefssiteaudit/i, name: 'AhrefsBot', category: 'seo' },
  { re: /semrushbot|siteauditbot/i, name: 'SemrushBot', category: 'seo' },
  { re: /mj12bot/i, name: 'MJ12bot (Majestic)', category: 'seo' },
  { re: /dotbot|rogerbot/i, name: 'DotBot (Moz)', category: 'seo' },
  { re: /screaming frog/i, name: 'Screaming Frog', category: 'seo' },
  { re: /dataforseo|serpstatbot|blexbot|barkrowler|zoominfobot|linkdexbot|sitebulb/i, name: 'Other SEO crawler', category: 'seo' },

  // ---- social / link preview fetchers ----
  { re: /facebookexternalhit|facebookcatalog/i, name: 'Facebook preview', category: 'social' },
  { re: /twitterbot/i, name: 'Twitterbot', category: 'social' },
  { re: /linkedinbot/i, name: 'LinkedInBot', category: 'social' },
  { re: /pinterest(bot)?\//i, name: 'Pinterestbot', category: 'social' },
  { re: /slackbot|slack-imgproxy/i, name: 'Slackbot', category: 'social' },
  { re: /discordbot/i, name: 'Discordbot', category: 'social' },
  { re: /telegrambot/i, name: 'TelegramBot', category: 'social' },
  { re: /whatsapp/i, name: 'WhatsApp preview', category: 'social' },
  { re: /redditbot|embedly|quora link preview|skypeuripreview|vkshare|tumblr/i, name: 'Other link preview', category: 'social' },

  // ---- monitoring / performance ----
  { re: /uptimerobot|pingdom|statuscake|site24x7|newrelicpinger|betteruptime|hetrixtool/i, name: 'Uptime monitor', category: 'monitoring' },
  { re: /chrome-lighthouse|lighthouse|pagespeed|gtmetrix|webpagetest|pingbot/i, name: 'Performance audit', category: 'monitoring' },
  { re: /vercel-(screenshot|favicon|og)|vercelbot/i, name: 'Vercel internal', category: 'monitoring' },

  // ---- headless / automation engines ----
  { re: /headlesschrome|headless_chrome/i, name: 'Headless Chrome', category: 'headless' },
  { re: /puppeteer/i, name: 'Puppeteer', category: 'headless' },
  { re: /playwright/i, name: 'Playwright', category: 'headless' },
  { re: /selenium|webdriver|phantomjs|electron\//i, name: 'Automation driver', category: 'headless' },

  // ---- raw HTTP clients / scrapers ----
  { re: /python-requests|python-urllib|aiohttp|httpx/i, name: 'Python HTTP client', category: 'library' },
  { re: /scrapy/i, name: 'Scrapy', category: 'library' },
  { re: /^curl\/|libcurl/i, name: 'curl', category: 'library' },
  { re: /^wget/i, name: 'Wget', category: 'library' },
  { re: /go-http-client/i, name: 'Go HTTP client', category: 'library' },
  { re: /node-fetch|axios\/|got \(|undici/i, name: 'Node HTTP client', category: 'library' },
  { re: /java\/|apache-httpclient|okhttp|jakarta/i, name: 'Java HTTP client', category: 'library' },
  { re: /postmanruntime|insomnia|httpie|guzzlehttp|winhttp|restsharp/i, name: 'API client', category: 'library' },

  // ---- generic catch-all, last ----
  {
    re: /\bbot\b|crawler|spider|crawl|scraper|fetcher|archiver|feedfetcher|monitor|preview|validator|checker|scanner/i,
    name: 'Unclassified bot',
    category: 'other',
  },
];

export interface BotMatch {
  name: string;
  category: BotCategory;
}

/** Known-bot lookup by user-agent string. null = not a self-declared bot. */
export function matchBot(ua: string | null): BotMatch | null {
  if (!ua) return null;
  for (const rule of BOT_RULES) {
    if (rule.re.test(ua)) return { name: rule.name, category: rule.category };
  }
  return null;
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'tv' | 'unknown';

export interface UaInfo {
  browser: string;
  browserVersion: string | null;
  os: string;
  osVersion: string | null;
  deviceType: DeviceType;
  /** Best-effort hardware hint — "Apple", "Samsung", "Google"… or null. */
  vendor: string | null;
}

const UNKNOWN_UA: UaInfo = {
  browser: 'Unknown',
  browserVersion: null,
  os: 'Unknown',
  osVersion: null,
  deviceType: 'unknown',
  vendor: null,
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Android handset maker. Most Android UAs carry a model code rather than a
 * brand name — "SM-S918B" is a Galaxy S23 Ultra, and no amount of looking for
 * the word "Samsung" will find it — so the model prefixes come first.
 */
function androidVendor(ua: string): string | null {
  const MODEL_PREFIXES: Array<[RegExp, string]> = [
    [/;\s*SM-|;\s*GT-|;\s*SCH-|;\s*SPH-/i, 'Samsung'],
    [/;\s*Pixel/i, 'Google'],
    [/;\s*(Mi|POCO|M\d{4}|2\d{6})[\s;)]/, 'Xiaomi'],
    [/;\s*CPH\d/i, 'OPPO'],
    [/;\s*RMX\d/i, 'Realme'],
    [/;\s*V\d{4}/i, 'Vivo'],
    [/;\s*(LM-|LG-)/i, 'LG'],
    [/;\s*moto |;\s*XT\d{4}/i, 'Motorola'],
  ];
  for (const [re, brand] of MODEL_PREFIXES) if (re.test(ua)) return brand;
  const named = ua.match(/;\s*(samsung|pixel|xiaomi|redmi|oneplus|oppo|vivo|huawei|motorola|nokia|realme|honor|tecno|infinix)/i);
  return named ? title(named[1]) : null;
}

function version(ua: string, re: RegExp): string | null {
  const m = ua.match(re);
  return m && m[1] ? m[1].replace(/_/g, '.') : null;
}

/** Browser family + version. Order matters: every Chromium fork claims "Chrome". */
function parseBrowser(ua: string): { browser: string; browserVersion: string | null } {
  const pairs: Array<[RegExp, string, RegExp]> = [
    [/\bedg(?:e|a|ios)?\//i, 'Edge', /\bedg(?:e|a|ios)?\/([\d.]+)/i],
    [/\bopr\/|\bopera/i, 'Opera', /(?:\bopr|opera)[/ ]([\d.]+)/i],
    [/\bsamsungbrowser\//i, 'Samsung Internet', /samsungbrowser\/([\d.]+)/i],
    [/\byabrowser\//i, 'Yandex Browser', /yabrowser\/([\d.]+)/i],
    [/\bucbrowser\//i, 'UC Browser', /ucbrowser\/([\d.]+)/i],
    [/\bbrave\//i, 'Brave', /brave\/([\d.]+)/i],
    [/\bvivaldi\//i, 'Vivaldi', /vivaldi\/([\d.]+)/i],
    [/\bduckduckgo\//i, 'DuckDuckGo', /duckduckgo\/([\d.]+)/i],
    [/\bfbav\/|fb_iab/i, 'Facebook in-app', /fbav\/([\d.]+)/i],
    [/\binstagram /i, 'Instagram in-app', /instagram ([\d.]+)/i],
    [/\bmusical_ly|\btiktok/i, 'TikTok in-app', /musical_ly_([\d.]+)/i],
    [/\bpinterest\//i, 'Pinterest in-app', /pinterest\/([\d.]+)/i],
    [/\bsnapchat/i, 'Snapchat in-app', /snapchat\/([\d.]+)/i],
    [/\bline\//i, 'LINE in-app', /line\/([\d.]+)/i],
    [/\bfirefox\/|\bfxios\//i, 'Firefox', /(?:firefox|fxios)\/([\d.]+)/i],
    [/\bcrios\//i, 'Chrome (iOS)', /crios\/([\d.]+)/i],
    [/\bchrome\//i, 'Chrome', /chrome\/([\d.]+)/i],
    [/\bsafari\//i, 'Safari', /version\/([\d.]+)/i],
    [/\bmsie |\btrident\//i, 'Internet Explorer', /(?:msie |rv:)([\d.]+)/i],
  ];
  for (const [test, name, verRe] of pairs) {
    if (test.test(ua)) return { browser: name, browserVersion: version(ua, verRe) };
  }
  return { browser: 'Unknown', browserVersion: null };
}

function parseOs(ua: string): { os: string; osVersion: string | null; vendor: string | null } {
  if (/windows nt/i.test(ua)) {
    const nt = version(ua, /windows nt ([\d.]+)/i);
    const NAMES: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return { os: 'Windows', osVersion: nt ? (NAMES[nt] ?? nt) : null, vendor: null };
  }
  if (/\bipad|\biphone|\bipod/i.test(ua)) {
    return { os: 'iOS', osVersion: version(ua, /os ([\d_]+)/i), vendor: 'Apple' };
  }
  if (/android/i.test(ua)) {
    return { os: 'Android', osVersion: version(ua, /android ([\d.]+)/i), vendor: androidVendor(ua) };
  }
  if (/mac os x|macintosh/i.test(ua)) {
    return { os: 'macOS', osVersion: version(ua, /mac os x ([\d_.]+)/i), vendor: 'Apple' };
  }
  if (/cros/i.test(ua)) return { os: 'ChromeOS', osVersion: null, vendor: 'Google' };
  if (/windows phone/i.test(ua)) return { os: 'Windows Phone', osVersion: null, vendor: null };
  if (/linux|x11/i.test(ua)) return { os: 'Linux', osVersion: null, vendor: null };
  return { os: 'Unknown', osVersion: null, vendor: null };
}

function parseDeviceType(ua: string): DeviceType {
  if (/\bipad\b|tablet|playbook|silk|kindle|nexus (7|9|10)/i.test(ua)) return 'tablet';
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return 'tablet';
  if (/smart-?tv|appletv|googletv|hbbtv|netcast|roku|crkey/i.test(ua)) return 'tv';
  if (/\bmobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(ua)) return 'mobile';
  if (/windows nt|macintosh|mac os x|x11|cros|linux/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function parseUserAgent(ua: string | null): UaInfo {
  if (!ua || ua.length < 8) return UNKNOWN_UA;
  const { browser, browserVersion } = parseBrowser(ua);
  const { os, osVersion, vendor } = parseOs(ua);
  return { browser, browserVersion, os, osVersion, deviceType: parseDeviceType(ua), vendor };
}
