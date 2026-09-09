/**
 * Post-capture profile survey (brand bible §07, doc 02 "Profile quiz").
 *
 * Three steps, shown one at a time, no progress bar / skip / back. Dots at the
 * foot of each step light up as the visitor advances.
 *
 *   1 — age + gender on one page; dissolves once both are answered
 *   2 — "where are you in life right now" identity statement (single pick)
 *   3 — "who inspires you most" figure grid (pick two, then Continue)
 *
 * Routing: each figure carries the preset profile it signals (doc 02); the life
 * statement carries lighter weights. We tally and take the top profile; ties fall
 * back to a fixed priority order. In this prototype the result is only logged.
 *
 * Consumed by: Quiz.astro (inline, in the capture sheet) and quiz.astro (the
 * future full-page version).
 */

import type { ProfileKey, WorldKey } from './worlds';
import { WORLDS } from './worlds';

export const QUIZ_COPY = {
  /** shown when the visitor left a phone or email. */
  confirmHeading: "You're in.",
  /** shown when the visitor proceeded without leaving contact details. */
  confirmHeadingNoContact: "You're in.",
  confirmSub: "Let's get your motivational fit.",
  doneHeading: 'Welcome to the community!',
  doneSub: "We're glad you're here.",
} as const;

/** One label-only choice (life step). `weights` nudges routing. */
export interface ChoiceOption {
  label: string;
  weights?: Partial<Record<ProfileKey, number>>;
}

/** One figure card in the "who inspires you" step. */
export interface FigureOption {
  name: string;
  /** one-word descriptor shown under the name. */
  tag: string;
  /** the preset profile this pick signals (doc 02). */
  profile: ProfileKey;
}

/** A sub-question inside the combined age + gender step. */
export interface DemoGroup {
  key: 'age' | 'gender';
  label: string;
  cols: 2 | 3;
  options: string[];
}

export type SurveyStep =
  | { id: 'demo'; kind: 'demo'; groups: DemoGroup[] }
  | { id: 'life'; kind: 'single'; prompt: string; options: ChoiceOption[] }
  | {
      id: 'inspires';
      kind: 'multi';
      prompt: string;
      helper: string;
      pick: number;
      options: FigureOption[];
    };

export const STEPS: SurveyStep[] = [
  {
    id: 'demo',
    kind: 'demo',
    groups: [
      {
        key: 'age',
        label: 'Age',
        cols: 3,
        options: ['13–17', '18–24', '25–34', '35–44', '45–54', '55+'],
      },
      { key: 'gender', label: 'Gender', cols: 2, options: ['Male', 'Female'] },
    ],
  },
  {
    id: 'life',
    kind: 'single',
    prompt: 'Where are you in life right now?',
    options: [
      { label: "I'm rebuilding after something hard", weights: { diane: 2 } },
      { label: "I'm building toward something big", weights: { jerome: 2 } },
      {
        label: "I'm trying to feel like myself again",
        weights: { diane: 1, sarah: 1 },
      },
      {
        label: "I'm trying to be who I know I'm capable of being",
        weights: { marcus: 1, jerome: 1 },
      },
    ],
  },
  {
    id: 'inspires',
    kind: 'multi',
    prompt: 'Who inspires you most?',
    helper: 'Pick two.',
    pick: 2,
    options: [
      { name: 'David Goggins', tag: 'Discipline', profile: 'marcus' },
      { name: 'Marcus Aurelius', tag: 'Stoicism', profile: 'marcus' },
      { name: 'Steve Jobs', tag: 'Vision', profile: 'jerome' },
      { name: 'Alex Hormozi', tag: 'Building', profile: 'jerome' },
      { name: 'Taylor Swift', tag: 'Reinvention', profile: 'sarah' },
      { name: 'Alex Cooper', tag: 'Unfiltered', profile: 'sarah' },
      { name: 'Beyoncé', tag: 'Power', profile: 'grace' },
      { name: 'Zendaya', tag: 'Poise', profile: 'grace' },
      { name: 'Oprah Winfrey', tag: 'Rising', profile: 'diane' },
      { name: 'Mel Robbins', tag: 'Momentum', profile: 'diane' },
      { name: 'Jesus', tag: 'Faith', profile: 'james' },
      { name: 'My pastor', tag: 'Faith', profile: 'james' },
      { name: 'My dad', tag: 'Roots', profile: 'marcus' },
    ],
  },
];

/** Captured survey answers. Contact (phone|email) is added by the capture sheet. */
export interface SurveyAnswers {
  phone?: string;
  email?: string;
  /** honeypot — always '' for a real user; posted to /api/survey, never routed. */
  company?: string;
  age?: string;
  gender?: string;
  /** chosen life-statement label. */
  life?: string;
  /** chosen figure names (length === STEPS "inspires".pick). */
  inspires?: string[];
}

/** Back-compat alias for the cross-island event type. */
export type QuizAnswers = SurveyAnswers;

/** Tie-break order when two profiles score equally. */
const PROFILE_PRIORITY: ProfileKey[] = [
  'diane',
  'james',
  'marcus',
  'jerome',
  'sarah',
  'grace',
];

const INSPIRES = STEPS.find((s) => s.id === 'inspires') as Extract<
  SurveyStep,
  { id: 'inspires' }
>;
const LIFE = STEPS.find((s) => s.id === 'life') as Extract<
  SurveyStep,
  { id: 'life' }
>;

/** Tally the answers and return the routed profile. */
export function routeProfile(answers: SurveyAnswers): ProfileKey {
  const score = {} as Record<ProfileKey, number>;
  const add = (p: ProfileKey, n: number) => {
    score[p] = (score[p] ?? 0) + n;
  };

  // figure picks — the strongest signal, 2 points each
  for (const name of answers.inspires ?? []) {
    const fig = INSPIRES.options.find((o) => o.name === name);
    if (fig) add(fig.profile, 2);
  }

  // life statement — lighter nudge
  const lifeOpt = LIFE.options.find((o) => o.label === answers.life);
  if (lifeOpt?.weights) {
    for (const [profile, weight] of Object.entries(lifeOpt.weights)) {
      add(profile as ProfileKey, weight ?? 0);
    }
  }

  let best: ProfileKey = PROFILE_PRIORITY[0];
  let bestScore = -1;
  for (const profile of PROFILE_PRIORITY) {
    const s = score[profile] ?? 0;
    if (s > bestScore) {
      best = profile;
      bestScore = s;
    }
  }
  return best;
}

/** The world that owns a given profile (for the eventual redirect target). */
export function worldForProfile(profile: ProfileKey): WorldKey {
  const world = WORLDS.find((w) => w.profile === profile);
  return world ? world.key : 'stoic';
}
