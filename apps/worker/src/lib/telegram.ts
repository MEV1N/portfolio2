import { config } from '../config.js';

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramDailySummary(message: string): Promise<boolean> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;

  if (!token || !chatId) {
    console.warn('[Telegram Daily Summary] Missing credentials. Skipping dispatch.');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      console.warn(`[Telegram API Error] Status ${res.status}`);
      return false;
    }
    console.log('[Telegram Daily Digest Sent]');
    return true;
  } catch (err) {
    console.warn('[Telegram Daily Digest Network Error]:', (err as Error).message);
    return false;
  }
}
