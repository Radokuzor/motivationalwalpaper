/**
 * The six worlds — single source of truth.
 *
 * One chrome, six aesthetic worlds inside it (brand bible §08). A world supplies
 * a palette, a wallpaper line, and the artwork tokens the lock-screen panels and
 * theme cards render from. Worlds NEVER touch the chrome — no world colour on a
 * button, link or nav.
 *
 * The array order is the Screen One reel order (§07): alternating opposite worlds
 * so any visitor sees themselves within two swipes.
 *
 * Consumed by: Reel.astro, LockScreen.astro, ThemeGrid.astro, gallery.astro,
 * iphone-wallpapers/[theme].astro, and the reel island script.
 */

export type WorldKey =
  | 'stoic'
  | 'soft'
  | 'scripture'
  | 'builder'
  | 'aesthetic'
  | 'rebuild'
  | 'anime';

/** Preset customer profile a world routes to (doc 02). */
export type ProfileKey =
  | 'marcus'
  | 'sarah'
  | 'james'
  | 'jerome'
  | 'grace'
  | 'diane';

export interface WorldSwatch {
  name: string;
  hex: string;
}

export interface World {
  key: WorldKey;
  /** Display name, e.g. "Soft Life". */
  name: string;
  /** URL-safe slug, e.g. "soft-life". */
  slug: string;
  /** Routed preset profile. Omitted for bonus categories the quiz never routes to. */
  profile?: ProfileKey;
  /** Reel inclusion — set false to keep a world out of the six-panel swipe reel
   *  and show it only as a browsable category. Defaults to true. */
  inReel?: boolean;
  /** "<name>, <age> — <feeling>" from §08. */
  persona: string;
  feeling: string;
  /** The wallpaper line — one line, <= 6 words, set in the world's display face.
   *  Used only by the /iphone-wallpapers SEO template, not Screen One. */
  line: string;
  /** Full CSS background value for the full-bleed art. */
  art: string;
  /** `--fg` — overlay text colour on this artwork. */
  overlay: string;
  /** `--line` — wallpaper-line colour (differs from overlay only for Builder). */
  lineColor: string;
  /** `--scrim` — rgba used for the 0–35% top/bottom scrims. */
  scrim: string;
  /** text-shadow for a label sitting on this artwork ('none' on light worlds). */
  labelShadow: string;
  /** Human label of the prototype stand-in display face (§08 real face is TBD). */
  displayFont: string;
  /** §08 word list — also used as the quiz-routing vocabulary. */
  tags: string[];
  /** The three §08 palette swatches. */
  palette: WorldSwatch[];
}

export const WORLDS: World[] = [
  {
    key: 'stoic',
    name: 'Gym',
    slug: 'stoic',
    profile: 'marcus',
    persona: 'Marcus, 24 — resolve',
    feeling: 'resolve',
    line: 'The work is the point.',
    art: 'radial-gradient(125% 85% at 50% 6%, #3A3F45 0%, #17191d 46%, #0C0D0F 100%)',
    overlay: '#FFFFFF',
    lineColor: '#FFFFFF',
    scrim: 'rgba(0,0,0,.42)',
    labelShadow: '0 1px 6px rgba(0,0,0,.5)',
    displayFont: 'Oswald (condensed caps)',
    tags: ['forged', 'locked in', 'earned', "no one's watching"],
    palette: [
      { name: 'obsidian', hex: '#0C0D0F' },
      { name: 'steel', hex: '#3A3F45' },
      { name: 'bone', hex: '#C9C6BE' },
    ],
  },
  {
    key: 'soft',
    name: 'Self Love',
    slug: 'soft-life',
    profile: 'sarah',
    persona: 'Sarah, 19 — possibility',
    feeling: 'possibility',
    line: 'You are allowed to begin again.',
    art: 'linear-gradient(178deg, #FBF4EC 0%, #F3D9DA 46%, #C9AE97 100%)',
    overlay: '#1B1B1C',
    lineColor: '#1B1B1C',
    scrim: 'rgba(255,255,255,.34)',
    labelShadow: 'none',
    displayFont: 'Mulish (light humanist)',
    tags: ['bloom', 'era', 'intentional', 'becoming'],
    palette: [
      { name: 'blush', hex: '#F3D9DA' },
      { name: 'cream', hex: '#FBF4EC' },
      { name: 'warm taupe', hex: '#C9AE97' },
    ],
  },
  {
    key: 'scripture',
    name: 'Faith',
    slug: 'scripture',
    profile: 'james',
    persona: 'Pastor James, 42 — steadiness',
    feeling: 'steadiness',
    line: 'Be still. He has you.',
    art: 'linear-gradient(180deg, #1B2440 0%, #131A2B 52%, #0D1220 100%)',
    overlay: '#EFE7D3',
    lineColor: '#EFE7D3',
    scrim: 'rgba(0,0,0,.40)',
    labelShadow: '0 1px 6px rgba(0,0,0,.55)',
    displayFont: 'Cormorant Garamond (transitional serif)',
    tags: ['the Word', 'carry', 'stand', 'armor'],
    palette: [
      { name: 'deep navy', hex: '#131A2B' },
      { name: 'parchment', hex: '#EFE7D3' },
      { name: 'gold leaf', hex: '#B8924A' },
    ],
  },
  {
    key: 'builder',
    name: 'Entrepreneurship',
    slug: 'builder',
    profile: 'jerome',
    persona: 'Jerome, 28 — momentum',
    feeling: 'momentum',
    line: 'Build it in the quiet.',
    art: 'radial-gradient(120% 78% at 50% 0%, #202227 0%, #131417 44%, #0A0A0A 100%)',
    overlay: '#FFFFFF',
    lineColor: '#C79A3E',
    scrim: 'rgba(0,0,0,.42)',
    labelShadow: '0 1px 6px rgba(0,0,0,.55)',
    displayFont: 'Archivo (tight grotesk)',
    tags: ['build', 'execute', 'next chapter', 'in silence'],
    palette: [
      { name: 'black', hex: '#0A0A0A' },
      { name: 'ink', hex: '#16181C' },
      { name: 'gold', hex: '#C79A3E' },
    ],
  },
  {
    key: 'aesthetic',
    name: 'Aesthetic',
    slug: 'aesthetic',
    profile: 'grace',
    persona: 'Grace, 16 — ease',
    feeling: 'ease',
    line: 'Today gets to be soft.',
    art: 'linear-gradient(158deg, #E4DEF3 0%, #DCEEE4 54%, #F6DDE8 100%)',
    overlay: '#3A3A3A',
    lineColor: '#3A3A3A',
    scrim: 'rgba(255,255,255,.36)',
    labelShadow: 'none',
    displayFont: 'Quicksand (rounded sans)',
    tags: ['vibe', 'glow', 'cozy', "it's giving"],
    palette: [
      { name: 'lilac', hex: '#E4DEF3' },
      { name: 'mint', hex: '#DCEEE4' },
      { name: 'petal', hex: '#F6DDE8' },
    ],
  },
  {
    key: 'rebuild',
    name: 'Healing',
    slug: 'rebuild',
    profile: 'diane',
    persona: 'Diane, 34 — strength',
    feeling: 'strength',
    line: 'You are still here.',
    art: 'linear-gradient(168deg, #C4CDBE 0%, #D8B9A5 100%)',
    overlay: '#3A3A3A',
    lineColor: '#3A3A3A',
    scrim: 'rgba(255,255,255,.34)',
    labelShadow: 'none',
    displayFont: 'Lora italic (quiet old-style serif)',
    tags: ['carried', 'grace', 'still here', 'rebuild'],
    palette: [
      { name: 'sage', hex: '#C4CDBE' },
      { name: 'clay', hex: '#D8B9A5' },
      { name: 'warm white', hex: '#F4EFE8' },
    ],
  },
  {
    key: 'anime',
    name: 'Anime & Sci-Fi',
    slug: 'anime-scifi',
    inReel: false,
    persona: 'Kai, 20 — escapism',
    feeling: 'escapism',
    line: 'Protagonist energy only.',
    art: 'linear-gradient(158deg, #1B1035 0%, #3A1360 42%, #7A1FA6 74%, #E63C8C 100%)',
    overlay: '#FFFFFF',
    lineColor: '#FFFFFF',
    scrim: 'rgba(0,0,0,.40)',
    labelShadow: '0 1px 8px rgba(0,0,0,.55)',
    displayFont: 'Orbitron (geometric display)',
    tags: ['main character', 'arc', 'level up', 'not filler'],
    palette: [
      { name: 'void purple', hex: '#1B1035' },
      { name: 'ultraviolet', hex: '#7A1FA6' },
      { name: 'neon pink', hex: '#E63C8C' },
    ],
  },
];

/** The worlds that get a swipeable panel in the lock-screen reel — brand
 *  bible's six, in reel order. Bonus categories (`inReel: false`) are
 *  browsable everywhere else but never enter the reel. */
export const REEL_WORLDS: World[] = WORLDS.filter((w) => w.inReel !== false);

/** Reel order = REEL_WORLDS order. */
export const REEL_ORDER: WorldKey[] = REEL_WORLDS.map((w) => w.key);

const BY_KEY: Record<WorldKey, World> = Object.fromEntries(
  WORLDS.map((w) => [w.key, w]),
) as Record<WorldKey, World>;

export function worldByKey(key: WorldKey): World {
  return BY_KEY[key];
}

export function worldIndex(key: WorldKey): number {
  return REEL_ORDER.indexOf(key);
}
