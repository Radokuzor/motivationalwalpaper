/**
 * Client-side wallpaper export.
 *
 * The six "wallpapers" are CSS gradients + a one-line message (see
 * `src/data/worlds.ts`) — there are no image files. `downloadWallpaper()` paints
 * the chosen world onto an off-screen canvas at phone-lock-screen resolution and
 * hands the visitor a PNG. It renders the *plain* wallpaper — gradient art + the
 * line — with none of the iOS mock chrome (clock, padlock, dynamic island).
 *
 * Called by CaptureSheet.astro on submit; the target world is whatever is
 * centred in the reel (Reel.astro broadcasts `mw:reel-world`).
 */
import { WORLDS, type WorldKey } from '../data/worlds';

type World = (typeof WORLDS)[number];

/** iPhone 14/15 Pro lock-screen pixel size. */
const W = 1170;
const H = 2532;

interface Stop {
  color: string;
  at: number; // 0..1
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Split on top-level commas (keeps `rgba(…, …)` intact). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseStops(body: string): Stop[] {
  const parts = splitTop(body);
  const stops: Stop[] = [];
  parts.forEach((p, i) => {
    const m = p
      .trim()
      .match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*(?:([\d.]+)%)?$/);
    if (!m) return;
    const at =
      m[2] !== undefined
        ? parseFloat(m[2]) / 100
        : parts.length > 1
          ? i / (parts.length - 1)
          : 0;
    stops.push({ color: m[1], at });
  });
  return stops;
}

function paintLinear(
  ctx: CanvasRenderingContext2D,
  angleDeg: number,
  stops: Stop[],
): void {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad); // CSS 0deg points up
  const halfLen = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  const cx = W / 2;
  const cy = H / 2;
  const g = ctx.createLinearGradient(
    cx - dx * halfLen,
    cy - dy * halfLen,
    cx + dx * halfLen,
    cy + dy * halfLen,
  );
  for (const s of stops) g.addColorStop(clamp01(s.at), s.color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Canvas radial gradients are circular; fake the CSS ellipse by scaling y. */
function paintRadial(
  ctx: CanvasRenderingContext2D,
  rxPct: number,
  ryPct: number,
  cxPct: number,
  cyPct: number,
  stops: Stop[],
): void {
  const cx = (cxPct / 100) * W;
  const cy = (cyPct / 100) * H;
  const rx = (rxPct / 100) * W;
  const ry = (ryPct / 100) * H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx || 1);
  ctx.translate(-cx, -cy);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  for (const s of stops) g.addColorStop(clamp01(s.at), s.color);
  ctx.fillStyle = g;
  ctx.fillRect(-W, -H, W * 3, H * 3);
  ctx.restore();
}

function paintArt(ctx: CanvasRenderingContext2D, art: string): void {
  const lin = art.match(/^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)\s*$/);
  if (lin) {
    paintLinear(ctx, parseFloat(lin[1]), parseStops(lin[2]));
    return;
  }
  const rad = art.match(
    /^radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,\s*(.+)\)\s*$/,
  );
  if (rad) {
    paintRadial(
      ctx,
      parseFloat(rad[1]),
      parseFloat(rad[2]),
      parseFloat(rad[3]),
      parseFloat(rad[4]),
      parseStops(rad[5]),
    );
    return;
  }
  // unrecognised — solid fallback so the export is never blank
  ctx.fillStyle = '#111214';
  ctx.fillRect(0, 0, W, H);
}

/** Per-world line treatment — mirrors LockScreen.astro `.wp-line` inflections. */
const INFLECTION: Record<
  WorldKey,
  { weight: number; size: number; upper: boolean; italic: boolean; spacing: string }
> = {
  stoic: { weight: 500, size: 0.072, upper: true, italic: false, spacing: '0.06em' },
  soft: { weight: 300, size: 0.072, upper: false, italic: false, spacing: '0.01em' },
  scripture: { weight: 600, size: 0.088, upper: false, italic: false, spacing: '0em' },
  builder: { weight: 800, size: 0.072, upper: false, italic: false, spacing: '-0.02em' },
  aesthetic: { weight: 600, size: 0.072, upper: false, italic: false, spacing: '0em' },
  rebuild: { weight: 500, size: 0.082, upper: false, italic: true, spacing: '0em' },
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxW && cur) {
      out.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function drawLine(ctx: CanvasRenderingContext2D, w: World): Promise<void> {
  const face =
    getComputedStyle(document.documentElement)
      .getPropertyValue(`--face-${w.key}`)
      .trim() || 'system-ui, sans-serif';
  const infl = INFLECTION[w.key];
  const fontPx = Math.round(W * infl.size);
  const font = `${infl.italic ? 'italic ' : ''}${infl.weight} ${fontPx}px ${face}`;

  // let the display face load, but never hang the download on it
  try {
    await Promise.race([
      Promise.all([document.fonts.load(font), document.fonts.ready]),
      new Promise((r) => setTimeout(r, 400)),
    ]);
  } catch {
    /* fall back to whatever face is ready */
  }

  ctx.font = font;
  ctx.fillStyle = w.lineColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in withSpacing) withSpacing.letterSpacing = infl.spacing;
  if (w.labelShadow !== 'none') {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;
  }

  const text = infl.upper ? w.line.toUpperCase() : w.line;
  const lines = wrapText(ctx, text, W * 0.76);
  const lineHeight = fontPx * 1.2;
  const startY = H * 0.6 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineHeight));
}

/** Render the given world's plain wallpaper and trigger a PNG download. */
export async function downloadWallpaper(key: WorldKey): Promise<void> {
  const w = WORLDS.find((x) => x.key === key);
  if (!w) return;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  paintArt(ctx, w.art);
  await drawLine(ctx, w);

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `motivationalwallpaper-${w.slug}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      resolve();
    }, 'image/png');
  });
}
