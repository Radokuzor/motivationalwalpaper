/**
 * Cross-island events.
 *
 * The Screen One islands (Reel, CaptureSheet, Quiz, ThemeGrid) don't import each
 * other — they talk through these CustomEvents on `document`. index.astro is the
 * only orchestrator that wires the flow end to end.
 */

import type { ProfileKey, WorldKey } from '../data/worlds';
import type { QuizAnswers } from '../data/quiz';

export const MW = {
  /** Ask the capture sheet to open (fired by the CTA and by tapping the reel). */
  openCapture: 'mw:open-capture',
  /** Capture sheet: a valid email was submitted. */
  captureSubmit: 'mw:capture-submit',
  /** Quiz: all three questions answered. */
  quizComplete: 'mw:quiz-complete',
  /** Theme grid: pointer/focus entered a world card (desktop cross-fade). */
  worldHover: 'mw:world-hover',
  /** Theme grid: pointer/focus left the world cards. */
  worldHoverEnd: 'mw:world-hover-end',
  /** Theme grid: a world card was clicked (scroll the reel to it). */
  worldSelect: 'mw:world-select',
  /** Reel: the world now centred in the viewport (the download target). */
  reelWorld: 'mw:reel-world',
  /** Category rail / theme card: open the world's wallpaper grid. */
  categoryOpen: 'mw:category-open',
  /** Category grid: a specific uploaded photo was tapped — put it on screen. */
  assetSelect: 'mw:asset-select',
} as const;

export interface CaptureSubmitDetail {
  /** trimmed email, or '' if left blank (capture is optional). */
  email: string;
  /** trimmed phone, or '' if left blank (capture is optional). */
  phone: string;
  /** honeypot value — always '' for a real user; carried to /api/survey. */
  company: string;
}

export interface QuizCompleteDetail {
  answers: QuizAnswers;
  profile: ProfileKey;
  world: WorldKey;
}

export interface WorldDetail {
  world: WorldKey;
  /** Set only on `reelWorld`, and only when a specific uploaded photo was
   *  tapped (a category-grid tile backed by a real asset) — that exact photo
   *  is shown on the reel panel and becomes the download target, no
   *  gradient/text render. Absent (or explicitly cleared) means "download
   *  world's hero photo, or its gradient if it has none yet". */
  asset?: { id: string; thumbUrl: string; originalUrl: string };
}

export interface AssetSelectDetail {
  world: WorldKey;
  asset: { id: string; thumbUrl: string; originalUrl: string };
}

interface MwEventMap {
  'mw:open-capture': undefined;
  'mw:capture-submit': CaptureSubmitDetail;
  'mw:quiz-complete': QuizCompleteDetail;
  'mw:world-hover': WorldDetail;
  'mw:world-hover-end': undefined;
  'mw:world-select': WorldDetail;
  'mw:reel-world': WorldDetail;
  'mw:category-open': WorldDetail;
  'mw:asset-select': AssetSelectDetail;
}

export function emit<K extends keyof MwEventMap>(
  name: K,
  detail?: MwEventMap[K],
): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof MwEventMap>(
  name: K,
  handler: (detail: MwEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  document.addEventListener(name, listener);
  return () => document.removeEventListener(name, listener);
}
