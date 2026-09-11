/**
 * Client-side wallpaper download.
 *
 * A real uploaded photo is downloaded exactly as uploaded —
 * `downloadOriginal()` just fetches and saves it, no text stamped on top.
 * A world with no real photo yet (`GET /api/wallpapers?hero=1` has none for
 * it) falls back to `downloadWallpaper()`'s canvas render of its plain CSS
 * gradient, phone-lock-screen resolution — no quote, no iOS mock chrome.
 *
 * Called by CaptureSheet.astro on submit; the target world (and, for a
 * specific tapped photo, the exact asset) is whatever Reel.astro or
 * CategoryGrid.astro last broadcast via `mw:reel-world`.
 */
import { WORLDS, type WorldKey } from '../data/worlds';
import { getHeroMap } from './hero';

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

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Fetch a file and hand the visitor a save dialog for it, unmodified — used
 * for a real uploaded photo, which is never re-rendered or stamped with
 * text. Needs the Storage bucket to serve CORS for `fetch()` to read the
 * bytes back; best-effort (silently no-ops if the fetch fails).
 */
export async function downloadOriginal(url: string, filenameBase: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const ext = MIME_EXT[blob.type] ?? 'jpg';
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `${filenameBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    /* best-effort — a failed fetch just means no download fires */
  }
}

/**
 * Download the given world's wallpaper. A preferred real photo is handed
 * over exactly as uploaded — full quality, no text stamped on it. Only a
 * world with no photo yet falls back to rendering its plain CSS gradient
 * onto a canvas.
 */
export async function downloadWallpaper(key: WorldKey): Promise<void> {
  const w = WORLDS.find((x) => x.key === key);
  if (!w) return;

  const hero = (await getHeroMap())[key];
  if (hero) {
    await downloadOriginal(hero.originalUrl, `motivationalwallpaper-${w.slug}`);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  paintArt(ctx, w.art);

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
