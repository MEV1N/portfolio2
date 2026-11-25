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

interface TelegramAlertParams {
  prospectName: string;
  platform: string;
  sentiment: string;
  replyText: string;
  winProbability: number;
}

/**
 * Dispatches high-intent lead alerts to the designated Telegram Chat.
 */
export async function sendTelegramLeadAlert(params: TelegramAlertParams): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!token || !chatId) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Skipping dispatch.');
    return false;
  }

  const sentimentEmoji =
    params.sentiment === 'POSITIVE_INTEREST' ? '🔥 HIGH INTENT' : '💬 INQUIRY / OBJECTION';

  const message = [
    `🔥 <b>${sentimentEmoji} DETECTED!</b>`,
    ``,
    `<b>Prospect:</b> ${escapeHtml(params.prospectName)}`,
    `<b>Platform:</b> ${escapeHtml(params.platform)} · <b>Win:</b> ${params.winProbability}%`,
    `<b>Classification:</b> ${escapeHtml(params.sentiment)}`,
    ``,
    `<b>Inbound Reply:</b>`,
    `"${escapeHtml(params.replyText.slice(0, 300))}"`,
    ``,
    `<a href="${appUrl}/admin">Open in Admin</a>`,
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    return res.ok;
  } catch (err: unknown) {
    console.warn(`[Telegram Network Error]: ${(err as Error).message}`);
    return false;
  }
}

export interface FormatDossierParams {
  prospectName: string;
  matchedService: string;
  platform: string;
  winProbability: number;
  portfolioClicks: number;
  auditSummary: string | null;
  outboundHook?: string | null;
  incomingReply: string;
  proposedReply: string;
  adminUrl: string;
  sourceUrl?: string | null;
}

export function formatTelegramDossierHtml(params: FormatDossierParams): string {
  const shortAudit = (params.auditSummary || 'Identified high ROI opportunity').slice(0, 110);
  const sourcePart = params.sourceUrl
    ? ` · <a href="${escapeHtml(params.sourceUrl)}">View Source</a>`
    : '';

  return [
    `🔥 <b>New Reply — ${escapeHtml(params.prospectName)}</b>`,
    `${escapeHtml(params.matchedService)} · ${escapeHtml(params.platform)} · ${params.winProbability}% win · ${params.portfolioClicks} clicks`,
    ``,
    `<b>Why we pitched:</b> ${escapeHtml(shortAudit)}`,
    ``,
    `<b>Their message:</b>`,
    `"${escapeHtml(params.incomingReply)}"`,
    ``,
    `<b>Suggested reply:</b>`,
    `${escapeHtml(params.proposedReply)}`,
    ``,
    `<a href="${params.adminUrl}">Open in Admin</a>${sourcePart}`,
  ].join('\n');
}

interface TelegramDossierParams {
  leadId: string;
  prospectName: string;
  platform: string;
  sourceUrl: string | null;
  matchedService: string;
  fitScore: number;
  portfolioClicks: number;
  winProbability: number;
  auditSummary: string | null;
  outboundHook: string | null;
  incomingReply: string;
  proposedReply: string;
}

/**
 * Sends a rich, structured Telegram dossier with 2x2 inline action keyboard
 * and returns the Telegram message_id.
 */
export async function sendTelegramLeadDossier(params: TelegramDossierParams): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!token || !chatId) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Skipping dossier dispatch.');
    return null;
  }

  const adminUrl = `${appUrl}/admin?leadId=${params.leadId}`;
  const messageText = formatTelegramDossierHtml({
    prospectName: params.prospectName,
    matchedService: params.matchedService,
    platform: params.platform,
    winProbability: params.winProbability,
    portfolioClicks: params.portfolioClicks,
    auditSummary: params.auditSummary,
    outboundHook: params.outboundHook,
    incomingReply: params.incomingReply,
    proposedReply: params.proposedReply,
    adminUrl,
    sourceUrl: params.sourceUrl,
  });

  const adminBtn = isValidTelegramButtonUrl(adminUrl)
    ? { text: '✏️ Edit', url: adminUrl }
    : { text: '✏️ Edit', callback_data: `open_admin:${params.leadId}` };

  // 2x2 Inline Keyboard
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Send Reply', callback_data: `send_draft:${params.leadId}` },
        { text: '🔄 Rewrite', callback_data: `regen_draft:${params.leadId}` },
      ],
      [
        adminBtn,
        { text: '🚫 Opt-Out', callback_data: `optout:${params.leadId}` },
      ],
    ],
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: inlineKeyboard,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Telegram API Error] Status ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    const messageId = data.result?.message_id;
    console.log(`[Telegram Dossier Sent] Prospect: ${params.prospectName} | Telegram Msg ID: ${messageId}`);
    return typeof messageId === 'number' ? messageId : null;
  } catch (err: unknown) {
    console.warn(`[Telegram Network Error]: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Updates an existing Telegram message's text and/or inline buttons
 */
export async function editTelegramMessage(
  messageId: number,
  newText: string,
  replyMarkup?: any
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML',
    };
    if (replyMarkup !== undefined) {
      body.reply_markup = replyMarkup;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Telegram Edit Error]:', (err as Error).message);
    return false;
  }
}

/**
 * Updates just the inline keyboard markup of an existing Telegram message
 */
export async function editTelegramReplyMarkup(
  messageId: number,
  replyMarkup: any
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Telegram Edit Markup Error]:', (err as Error).message);
    return false;
  }
}

/**
 * Answers a Telegram callback query to dismiss loading state in UI
 */
export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends a message with optional reply_markup and reply_to_message_id
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: any,
  replyToMessageId?: number
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...(replyMarkup && { reply_markup: replyMarkup }),
        ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Builds live control panel message data and inline keyboard buttons
 */
export async function buildControlPanelData() {
  const { prisma } = await import('db');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeConfig, sentToday, pendingDrafts, totalProspects] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'pipelineActive' } }),
    prisma.messageThread.count({ where: { direction: 'OUTBOUND', createdAt: { gte: startOfDay } } }),
    prisma.lead.count({ where: { draftStatus: 'PENDING_REVIEW' } }),
    prisma.lead.count({ where: { status: { not: 'OPTED_OUT' } } }),
  ]);

  const isRunning = activeConfig?.value === 'true';

  const text = [
    `🎛️ <b>Lead Generation Control Panel</b>`,
    ``,
    `• <b>Listener:</b> 🟢 Active (24/7 reply alerts)`,
    `• <b>Outreach Engine:</b> ${isRunning ? '🟢 Running' : '🔴 Stopped'}`,
    `• <b>Today's Sent:</b> ${sentToday} / 25`,
    `• <b>Pending Drafts:</b> ${pendingDrafts}`,
    `• <b>Active Prospects:</b> ${totalProspects}`,
    ``,
    `<i>Use the buttons below to control the outbound lead generation engine.</i>`,
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [
      isRunning
        ? [{ text: '⏹️ Stop Scraping & Outreach', callback_data: 'engine:stop' }]
        : [{ text: '▶️ Start Scraping & Outreach', callback_data: 'engine:start' }],
      [
        { text: '📊 Stats', callback_data: 'engine:stats' },
        { text: '🔥 Hot Leads', callback_data: 'engine:hot' },
      ],
    ],
  };

  return { text, replyMarkup, isRunning };
}

/**
 * Builds the /stats summary message
 */
export async function buildStatsMessage(): Promise<string> {
  const { prisma } = await import('db');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [sentToday, repliesToday, positiveCount, totalLeads, activeConfig] = await Promise.all([
    prisma.messageThread.count({ where: { direction: 'OUTBOUND', createdAt: { gte: startOfDay } } }),
    prisma.messageThread.count({ where: { direction: 'INBOUND', createdAt: { gte: startOfDay } } }),
    prisma.messageThread.count({
      where: { direction: 'INBOUND', sentiment: 'POSITIVE_INTEREST', createdAt: { gte: startOfDay } },
    }),
    prisma.lead.count({ where: { status: { not: 'OPTED_OUT' } } }),
    prisma.systemConfig.findUnique({ where: { key: 'pipelineActive' } }),
  ]);

  const isRunning = activeConfig?.value === 'true';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return [
    `📊 <b>Pipeline Statistics</b>`,
    ``,
    `• <b>24/7 Listener:</b> 🟢 Active`,
    `• <b>Outreach Engine:</b> ${isRunning ? '🟢 Running' : '🔴 Stopped'}`,
    `• <b>Sent Today:</b> ${sentToday} / 25`,
    `• <b>Replies Today:</b> ${repliesToday}`,
    `• <b>Buying Signals:</b> ${positiveCount} 🔥`,
    `• <b>Active Pipeline:</b> ${totalLeads} leads`,
    ``,
    `<a href="${appUrl}/admin">Open Admin Desk</a>`,
  ].join('\n');
}

/**
 * Builds the /hot leads summary message
 */
export async function buildHotLeadsMessage(): Promise<string> {
  const { prisma } = await import('db');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const hotLeads = await prisma.lead.findMany({
    where: { winProbability: { gte: 50 }, status: { not: 'OPTED_OUT' } },
    orderBy: { winProbability: 'desc' },
    take: 5,
    include: { messageThreads: true },
  });

  if (hotLeads.length === 0) {
    return '🎯 No prospects currently at ≥50% win probability.';
  }

  const list = hotLeads
    .map((l) => {
      const clicks = l.messageThreads.reduce((acc, t) => acc + (t.portfolioClicks || 0), 0);
      return `• <a href="${appUrl}/admin?leadId=${l.id}"><b>${escapeHtml(l.name)}</b></a> — ${l.winProbability}% win · ${escapeHtml(l.matchedService.toUpperCase())} · ${clicks} clicks`;
    })
    .join('\n');

  return [
    `🔥 <b>Top High-Probability Prospects</b>`,
    ``,
    list,
    ``,
    `<i>Tap any link to inspect and reply directly.</i>`,
  ].join('\n');
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
