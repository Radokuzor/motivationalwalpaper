/**
 * Client-side wallpaper download.
 *
 * Every wallpaper on the site is a real uploaded photo now (no gradient
 * placeholder is ever presented as a downloadable wallpaper) — this just
 * fetches the file and hands the visitor a save dialog for it, unmodified,
 * no text stamped on top.
 *
 * Called by CaptureSheet.astro on submit; the target file is whatever
 * Reel.astro or CategoryGrid.astro last broadcast via `mw:reel-world`.
 */

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Fetch a file and hand the visitor a save dialog for it, unmodified. Needs
 * the Storage bucket to serve CORS for `fetch()` to read the bytes back;
 * best-effort (silently no-ops if the fetch fails).
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
