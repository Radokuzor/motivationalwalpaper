/**
 * Acquisition classification — "where did this visitor actually come from?".
 *
 * Two inputs, in priority order:
 *   1. UTM tags on the landing URL (explicit — a campaign you tagged yourself).
 *   2. The document.referrer host (implicit — what the browser volunteered).
 * Browsers strip referrers in plenty of cases (HTTPS→HTTP, apps opening links
 * in a webview, `rel=noreferrer`, most iOS in-app browsers), so "Direct" is
 * always partly a bucket of unknowns — the dashboard says so out loud rather
 * than pretending it's all people typing the domain.
 */

export type Channel =
  | 'organic_search' // Google/Bing/DDG results page
  | 'ai_assistant' // ChatGPT, Perplexity, Claude, Gemini, Copilot
  | 'paid_search' // gclid/msclkid, or utm_medium=cpc/ppc/paid
  | 'paid_social' // fbclid/ttclid + paid mediums
  | 'organic_social' // instagram.com, pinterest, reddit, tiktok…
  | 'email' // utm_medium=email, mail clients
  | 'referral' // any other site
  | 'internal' // our own domain (shouldn't happen — session-scoped referrer)
  | 'direct'; // no referrer at all

export const CHANNEL_LABELS: Record<Channel, string> = {
  organic_search: 'Organic search',
  ai_assistant: 'AI assistants',
  paid_search: 'Paid search',
  paid_social: 'Paid social',
  organic_social: 'Organic social',
  email: 'Email',
  referral: 'Referral',
  internal: 'Internal',
  direct: 'Direct / untagged',
};

/** host fragment -> display name. Matched as a suffix or substring of the host. */
const SEARCH_ENGINES: Array<[RegExp, string]> = [
  [/(^|\.)google\./i, 'Google'],
  [/(^|\.)bing\.com$/i, 'Bing'],
  [/(^|\.)duckduckgo\.com$/i, 'DuckDuckGo'],
  [/(^|\.)search\.yahoo\./i, 'Yahoo'],
  [/(^|\.)yandex\./i, 'Yandex'],
  [/(^|\.)baidu\.com$/i, 'Baidu'],
  [/(^|\.)ecosia\.org$/i, 'Ecosia'],
  [/(^|\.)brave\.com$/i, 'Brave Search'],
  [/(^|\.)startpage\.com$/i, 'Startpage'],
  [/(^|\.)qwant\.com$/i, 'Qwant'],
  [/(^|\.)naver\.com$/i, 'Naver'],
  [/(^|\.)seznam\.cz$/i, 'Seznam'],
  [/(^|\.)ask\.com$/i, 'Ask'],
  [/(^|\.)aol\.com$/i, 'AOL'],
];

const AI_ASSISTANTS: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/i, 'Perplexity'],
  [/(^|\.)claude\.ai$/i, 'Claude'],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i, 'Gemini'],
  [/(^|\.)copilot\.microsoft\.com$/i, 'Microsoft Copilot'],
  [/(^|\.)you\.com$/i, 'You.com'],
  [/(^|\.)poe\.com$/i, 'Poe'],
  [/(^|\.)phind\.com$/i, 'Phind'],
  [/(^|\.)deepseek\.com$/i, 'DeepSeek'],
  [/(^|\.)grok\.com$|(^|\.)x\.ai$/i, 'Grok'],
  [/(^|\.)mistral\.ai$|(^|\.)lechat\.mistral\.ai$/i, 'Le Chat'],
];

const SOCIAL: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)pinterest\.|(^|\.)pinterest\.com$|(^|\.)pin\.it$/i, 'Pinterest'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)facebook\.com$|(^|\.)m\.facebook\.com$|(^|\.)fb\.me$|(^|\.)l\.facebook\.com$/i, 'Facebook'],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/i, 'Reddit'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.co$/i, 'X / Twitter'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, 'YouTube'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i, 'LinkedIn'],
  [/(^|\.)snapchat\.com$/i, 'Snapchat'],
  [/(^|\.)threads\.net$|(^|\.)threads\.com$/i, 'Threads'],
  [/(^|\.)tumblr\.com$/i, 'Tumblr'],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/i, 'WhatsApp'],
  [/(^|\.)t\.me$|(^|\.)telegram\.me$/i, 'Telegram'],
  [/(^|\.)discord\.com$|(^|\.)discord\.gg$/i, 'Discord'],
  [/(^|\.)quora\.com$/i, 'Quora'],
  [/(^|\.)medium\.com$/i, 'Medium'],
  [/(^|\.)substack\.com$/i, 'Substack'],
  [/(^|\.)vk\.com$/i, 'VK'],
  [/(^|\.)weheartit\.com$|(^|\.)we\.tl$/i, 'We Heart It'],
];

const EMAIL_HOSTS = /(^|\.)mail\.google\.com$|(^|\.)outlook\.|(^|\.)mail\.yahoo\.|(^|\.)mail\.proton|(^|\.)superhuman\.com$/i;

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paidsocial|cpm|cpv|display|banner|retargeting)$/i;

export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

export const EMPTY_UTM: UtmParams = { source: null, medium: null, campaign: null, term: null, content: null };

export interface Acquisition {
  channel: Channel;
  /** Display name: "Google", "Pinterest", "chatgpt.com", "Direct"… */
  source: string;
  /** Bare hostname of the referrer, or null. */
  referrerHost: string | null;
  /** Full campaign label for the dashboard — utm_campaign, else null. */
  campaign: string | null;
}

/** Bare hostname, www-stripped. Returns null for an unparseable/empty referrer. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./i, '').toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function lookup(host: string, table: Array<[RegExp, string]>): string | null {
  for (const [re, name] of table) if (re.test(host)) return name;
  return null;
}

/**
 * Classify one session's acquisition.
 * `siteHost` is this site's own hostname — a referrer from it means the
 * session started mid-site (rare; the tracker is session-scoped).
 */
export function classifyAcquisition(
  referrer: string | null,
  utm: UtmParams,
  clickIds: Record<string, string | null>,
  siteHost = 'motivationalwallpaper.com',
): Acquisition {
  const host = referrerHost(referrer);
  const campaign = utm.campaign;
  const hasGoogleClick = Boolean(clickIds.gclid || clickIds.msclkid);
  const hasSocialClick = Boolean(clickIds.fbclid || clickIds.ttclid || clickIds.twclid || clickIds.li_fat_id);
  const paidMedium = utm.medium ? PAID_MEDIUMS.test(utm.medium) : false;

  // 1. Paid beats everything — a click id or an explicitly paid medium.
  if (hasGoogleClick || (paidMedium && !hasSocialClick)) {
    return { channel: 'paid_search', source: utm.source ?? (clickIds.msclkid ? 'Bing Ads' : 'Google Ads'), referrerHost: host, campaign };
  }
  if (hasSocialClick) {
    const named = utm.source ?? (host ? (lookup(host, SOCIAL) ?? host) : clickIds.fbclid ? 'Facebook' : 'Social ad');
    return { channel: paidMedium ? 'paid_social' : 'paid_social', source: named, referrerHost: host, campaign };
  }

  // 2. Explicit UTM medium the operator set.
  if (utm.medium && /^email$|^newsletter$|^mail$/i.test(utm.medium)) {
    return { channel: 'email', source: utm.source ?? 'Email', referrerHost: host, campaign };
  }

  // 3. Referrer host.
  if (host) {
    if (host === siteHost || host.endsWith(`.${siteHost}`)) {
      return { channel: 'internal', source: siteHost, referrerHost: host, campaign };
    }
    const ai = lookup(host, AI_ASSISTANTS);
    if (ai) return { channel: 'ai_assistant', source: ai, referrerHost: host, campaign };
    const search = lookup(host, SEARCH_ENGINES);
    if (search) return { channel: 'organic_search', source: search, referrerHost: host, campaign };
    const social = lookup(host, SOCIAL);
    if (social) return { channel: 'organic_social', source: social, referrerHost: host, campaign };
    if (EMAIL_HOSTS.test(host)) return { channel: 'email', source: 'Webmail', referrerHost: host, campaign };
    return { channel: 'referral', source: utm.source ?? host, referrerHost: host, campaign };
  }

  // 4. No referrer, but the link was tagged — trust the tag.
  if (utm.source) {
    const medium = utm.medium ?? '';
    const channel: Channel = /social/i.test(medium)
      ? 'organic_social'
      : /referral/i.test(medium)
        ? 'referral'
        : 'referral';
    return { channel, source: utm.source, referrerHost: null, campaign };
  }

  return { channel: 'direct', source: 'Direct', referrerHost: null, campaign };
}

/** Firestore-safe map key: no dots, slashes, or runaway length. */
export function safeKey(value: string | null | undefined, fallback = 'unknown'): string {
  const cleaned = (value ?? '')
    .trim()
    .replace(/[.\/\\~*\[\]`]/g, '-')
    .slice(0, 120);
  return cleaned || fallback;
}
