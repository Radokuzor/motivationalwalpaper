/**
 * notifyTelegram — server-only, fire-and-forget Telegram notifier.
 *
 * Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from the environment; if either
 * is missing this is a silent no-op (so the analytics endpoint still works
 * with Telegram unconfigured). Errors from the Telegram API are logged, never
 * thrown — a failed notification must not break the caller.
 */
/** Escape Telegram legacy-Markdown special characters in untrusted text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, '\\$1');
}

export async function notifyTelegram(text: string): Promise<void> {
  // Vercel exposes env vars on `process.env` at runtime; `astro dev` loads
  // `.env` into `import.meta.env`. Read whichever is populated.
  const env = { ...process.env, ...import.meta.env } as Record<string, string | undefined>;
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Telegram API error', res.status, detail);
    }
  } catch (err) {
    console.error('Telegram notify failed', err);
  }
}
