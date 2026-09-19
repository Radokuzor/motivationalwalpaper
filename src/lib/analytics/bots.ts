/**
 * Bot vs human classification.
 *
 * Nobody can do this perfectly, so the goal here is an *explainable* verdict:
 * every session carries the reasons behind its score, and /admin shows them, so
 * a surprising number can be audited instead of trusted blindly.
 *
 * Three layers, in order of confidence:
 *   1. Self-declared bots (UA string matched in ua.ts) — certain, score 100.
 *   2. Automation tells (navigator.webdriver, 0×0 screen, no locale) — strong.
 *   3. Behavioural implausibility (six pages in four seconds, never a scroll,
 *      never a pointer event) — weak alone, meaningful stacked.
 *
 * Bands: >= 60 bot, 25–59 suspect ("probably automated, judge for yourself"),
 * < 25 human. The dashboard defaults to humans-only and lets you flip to
 * "humans + suspects" or "bots only", because the middle band is where the
 * interesting arguments live.
 */
import type { ClientEnvironment, PageVisitPayload, EngagementPayload } from './payload';
import { matchBot, parseUserAgent, type BotCategory } from './ua';

export type TrafficQuality = 'human' | 'suspect' | 'bot';

export interface BotVerdict {
  quality: TrafficQuality;
  score: number;
  reasons: string[];
  /** Set only when the UA self-identified, e.g. "GPTBot (OpenAI)". */
  botName: string | null;
  botCategory: BotCategory | null;
}

interface Signal {
  when: boolean;
  weight: number;
  reason: string;
}

export interface ClassifyInput {
  userAgent: string | null;
  env?: Partial<ClientEnvironment> | null;
  pages?: PageVisitPayload[] | null;
  engagement?: Partial<EngagementPayload> | null;
  durationMs?: number | null;
  /** Accept-Language header — real browsers always send one. */
  acceptLanguage?: string | null;
}

const BOT_THRESHOLD = 60;
const SUSPECT_THRESHOLD = 25;

/** Median ms between page loads — "read three articles in two seconds" detector. */
function fastestHop(pages: PageVisitPayload[]): number | null {
  if (pages.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < pages.length; i += 1) {
    const gap = pages[i].enteredAt - pages[i - 1].enteredAt;
    if (gap >= 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  return Math.min(...gaps);
}

export function classifyTraffic(input: ClassifyInput): BotVerdict {
  const ua = input.userAgent;
  const known = matchBot(ua);
  if (known) {
    return {
      quality: 'bot',
      score: 100,
      reasons: [`Self-identified as ${known.name}`],
      botName: known.name,
      botCategory: known.category,
    };
  }

  const env = input.env ?? {};
  const pages = input.pages ?? [];
  const engagement = input.engagement ?? {};
  const parsed = parseUserAgent(ua);
  const hop = fastestHop(pages);
  const interactions =
    (engagement.clicks ?? 0) + (engagement.keypresses ?? 0) + (engagement.pointerMoves ?? 0) + (engagement.scrollEvents ?? 0);
  const maxScroll = pages.reduce((max, p) => Math.max(max, p.maxScrollPct ?? 0), 0);
  const hasClientEnv = typeof env.screenW === 'number';

  const signals: Signal[] = [
    // ---- layer 2: automation tells ----
    { when: env.webdriver === true, weight: 70, reason: 'navigator.webdriver is true (automation driver)' },
    { when: !ua || ua.length < 20, weight: 45, reason: 'Missing or stub user-agent' },
    { when: hasClientEnv && (!env.screenW || !env.screenH), weight: 40, reason: 'Reports a 0×0 screen' },
    { when: hasClientEnv && (!env.viewportW || !env.viewportH), weight: 30, reason: 'Reports a 0×0 viewport' },
    { when: hasClientEnv && !env.language, weight: 25, reason: 'No browser language set' },
    { when: !input.acceptLanguage, weight: 20, reason: 'No Accept-Language header' },
    { when: hasClientEnv && !env.timezone, weight: 20, reason: 'No timezone available' },
    { when: hasClientEnv && env.cookieEnabled === false, weight: 15, reason: 'Cookies disabled' },
    {
      when: hasClientEnv && parsed.deviceType === 'desktop' && parsed.browser.startsWith('Chrome') && env.pluginCount === 0,
      weight: 15,
      reason: 'Desktop Chrome with zero plugins (headless tell)',
    },
    {
      when: hasClientEnv && env.uaMobile === true && env.maxTouchPoints === 0,
      weight: 20,
      reason: 'Claims to be mobile but has no touch input',
    },
    {
      when: hasClientEnv && parsed.deviceType === 'mobile' && env.touch === false,
      weight: 15,
      reason: 'Mobile user-agent on a non-touch device',
    },
    { when: hasClientEnv && env.cores === 0, weight: 10, reason: 'Reports zero CPU cores' },
    { when: hasClientEnv && typeof env.dpr === 'number' && (env.dpr <= 0 || env.dpr > 6), weight: 10, reason: 'Implausible device pixel ratio' },

    // ---- layer 3: behavioural implausibility ----
    { when: hop !== null && hop < 400 && pages.length >= 3, weight: 35, reason: `Navigated ${pages.length} pages with a ${hop}ms gap` },
    { when: pages.length >= 5 && interactions === 0, weight: 30, reason: 'Five or more pages with zero interaction events' },
    {
      when: pages.length >= 2 && interactions === 0 && maxScroll === 0,
      weight: 20,
      reason: 'Multiple pages, never scrolled, never moved a pointer',
    },
    {
      when: (input.durationMs ?? 0) > 3000 && (engagement.activeMs ?? 0) === 0 && pages.length > 1,
      weight: 15,
      reason: 'Session lasted but the tab was never actually active',
    },
    { when: parsed.browser === 'Unknown' && parsed.os === 'Unknown' && Boolean(ua), weight: 20, reason: 'Unrecognised browser and OS' },
  ];

  const hits = signals.filter((s) => s.when);
  const score = Math.min(100, hits.reduce((sum, s) => sum + s.weight, 0));
  const quality: TrafficQuality = score >= BOT_THRESHOLD ? 'bot' : score >= SUSPECT_THRESHOLD ? 'suspect' : 'human';

  return {
    quality,
    score,
    reasons: hits.map((s) => s.reason),
    botName: quality === 'bot' ? 'Unnamed automation' : null,
    botCategory: quality === 'bot' ? 'headless' : null,
  };
}

export const QUALITY_LABELS: Record<TrafficQuality, string> = {
  human: 'Human',
  suspect: 'Suspected bot',
  bot: 'Bot',
};
