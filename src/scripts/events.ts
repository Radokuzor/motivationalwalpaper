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
}

interface MwEventMap {
  'mw:open-capture': undefined;
  'mw:capture-submit': CaptureSubmitDetail;
  'mw:quiz-complete': QuizCompleteDetail;
  'mw:world-hover': WorldDetail;
  'mw:world-hover-end': undefined;
  'mw:world-select': WorldDetail;
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
