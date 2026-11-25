import { config } from '../config.js';

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isValidTelegramButtonUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      !hostname.includes('.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface RedditLeadAlertParams {
  leadId: string;
  name: string;
  contactEmailOrHandle: string;
  sourceUrl?: string | null;
  matchedService: string;
  fitScore: number;
  postSummary?: string | null;
  draftReply: string;
}

export interface TelegramRedditAlertPayload {
  text: string;
  replyMarkup: {
    inline_keyboard: Array<
      Array<{
        text: string;
        copy_text?: { text: string };
        callback_data?: string;
        url?: string;
      }>
    >;
  };
}

/**
 * Formats clean, mobile-friendly HTML message and 2-row inline keyboard for Reddit leads:
 * Row 1: Copy DM (via Telegram copy_text) + Mark Sent
 * Row 2: Open Post + Author Profile
 */
export function formatTelegramRedditAlertHtml(params: RedditLeadAlertParams): TelegramRedditAlertPayload {
  const cleanHandle =
    params.contactEmailOrHandle
      .replace(/^u\//i, '')
      .replace(/^@/, '')
      .trim() || 'redditor';
  const authorHandle = params.contactEmailOrHandle.startsWith('u/')
    ? params.contactEmailOrHandle
    : `u/${cleanHandle}`;

  // Extract subreddit from sourceUrl (e.g. reddit.com/r/indianstartups/...) or postSummary
  const subMatch =
    params.sourceUrl?.match(/\/r\/([^/]+)/i) ||
    params.postSummary?.match(/\[r\/([^\]]+)\]/i);
  const subreddit = subMatch ? subMatch[1] : 'reddit';

  const serviceFormatted =
    params.matchedService === 'web'
      ? 'Web Development'
      : params.matchedService === 'video'
      ? 'Video Editing'
      : params.matchedService === 'design'
      ? 'UI/UX Design'
      : params.matchedService.toUpperCase();

  let cleanSummary = (params.postSummary || params.name)
    .replace(/\[r\/[^\]]+\]\s*/i, '')
    .replace(/\[Currency:\s*INR\]\s*/i, '')
    .replace(/\[Mobile LCP:.*?\]\s*/i, '')
    .trim();
  if (cleanSummary.length > 120) {
    cleanSummary = cleanSummary.slice(0, 117).trim() + '...';
  }

  // Ensure drafted DM is strictly <= 240 chars for copy_text
  let safeDraft = params.draftReply.trim();
  if (safeDraft.length > 240) {
    safeDraft = safeDraft.slice(0, 237).trim() + '...';
  }

  const text = [
    `🟠 <b>New Reddit Lead — ${escapeHtml(authorHandle)}</b>`,
    `r/${escapeHtml(subreddit)} · ${escapeHtml(serviceFormatted)} · Fit ${params.fitScore}/10`,
    ``,
    `<b>Post summary:</b> ${escapeHtml(cleanSummary)}`,
    ``,
    `<b>Draft DM (tap Copy below):</b>`,
    `<code>${escapeHtml(safeDraft)}</code>`,
  ].join('\n');

  const sourcePostUrl = isValidTelegramButtonUrl(params.sourceUrl)
    ? params.sourceUrl!
    : 'https://www.reddit.com';
  const authorProfileUrl = `https://www.reddit.com/user/${cleanHandle}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '📋 Copy DM', copy_text: { text: safeDraft } },
        { text: '✅ Mark Sent', callback_data: `social_sent:${params.leadId}` },
      ],
      [
        { text: '🔗 Open Post', url: sourcePostUrl },
        { text: '👤 Author Profile', url: authorProfileUrl },
      ],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Pushes instant notification to TELEGRAM_CHAT_ID with one-tap Copy DM and Reddit links.
 */
export async function sendTelegramRedditAlert(params: RedditLeadAlertParams): Promise<number | null> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;

  if (!token || !chatId) {
    console.warn('[Telegram Reddit Alert] Missing credentials. Skipping dispatch.');
    return null;
  }

  const { text, replyMarkup } = formatTelegramRedditAlertHtml(params);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Telegram Reddit Alert API Error] Status ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.result?.message_id || null;
  } catch (err) {
    console.warn('[Telegram Reddit Alert Network Error]:', (err as Error).message);
    return null;
  }
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
