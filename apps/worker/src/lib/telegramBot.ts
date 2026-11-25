import { prisma } from 'db';
import { config } from '../config.js';
import { dailySummaryJob } from '../jobs/dailySummary.js';
import { triggerPipelineRun } from '../queue.js';
import { pollGmailRepliesJob } from '../jobs/pollGmailReplies.js';

let isPolling = false;
let shouldStop = false;

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidTelegramButtonUrl(url: string | null | undefined): boolean {
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

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number };
    text?: string;
    reply_to_message?: {
      message_id: number;
      text?: string;
    };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
    data?: string;
  };
}

/**
 * Starts the long-polling Telegram Bot loop authenticated against TELEGRAM_CHAT_ID.
 */
export async function startTelegramBotPoller(): Promise<void> {
  const token = config.telegramBotToken;
  const authorizedChatId = config.telegramChatId;

  if (config.telegramUseWebhook === 'true' || process.env.TELEGRAM_USE_WEBHOOK === 'true') {
    console.log('[Telegram Bot] TELEGRAM_USE_WEBHOOK is true. Poller is disabled in favor of /api/webhooks/telegram webhook.');
    return;
  }

  if (!token || !authorizedChatId) {
    console.warn('[Telegram Bot] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Poller disabled.');
    return;
  }

  // Automatically delete any lingering webhook so local polling never collides with webhook mode
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    console.log('[Telegram Bot] Cleared active webhook to prevent polling conflicts.');
  } catch (err) {
    console.warn('[Telegram Bot] Notice clearing webhook:', (err as Error).message);
  }

  if (isPolling) return;
  isPolling = true;
  shouldStop = false;

  console.log('[Telegram Bot] Two-Way Interactive Command Center started listening...');
  let offset = 0;

  while (!shouldStop) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

      if (!res.ok) {
        console.warn(`[Telegram Bot] getUpdates HTTP ${res.status}. Retrying in 4s...`);
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json();
      const updates: TelegramUpdate[] = data.result || [];

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);

        // Security: strictly authenticate sender against TELEGRAM_CHAT_ID
        const senderId =
          update.message?.chat.id?.toString() ||
          update.callback_query?.message?.chat.id?.toString() ||
          update.callback_query?.from.id?.toString();

        if (senderId !== authorizedChatId.toString()) {
          console.warn(`[Telegram Bot Security] Ignored unauthorized event from ID: ${senderId}`);
          continue;
        }

        // 1. Handle Inline Button Callbacks
        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
        }

        // 2. Handle Text Messages & Swipe-Replies
        if (update.message?.text) {
          await handleMessage(update.message);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'TimeoutError') {
        console.warn('[Telegram Bot Error]:', (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export function stopTelegramBotPoller(): void {
  shouldStop = true;
  isPolling = false;
}

/**
 * Handles Inline Button Callbacks (send_draft, regen_draft, optout)
 */
async function handleCallbackQuery(query: NonNullable<TelegramUpdate['callback_query']>) {
  const data = query.data || '';
  const messageId = query.message?.message_id;

  if (data === 'engine:start') {
    console.log('[Telegram Bot] Received engine:start callback');
    await prisma.systemConfig.upsert({
      where: { key: 'pipelineActive' },
      update: { value: 'true' },
      create: { key: 'pipelineActive', value: 'true' },
    });
    await prisma.systemConfig.upsert({
      where: { key: 'outreachPaused' },
      update: { value: 'false' },
      create: { key: 'outreachPaused', value: 'false' },
    });

    await answerCallbackQuery(query.id, '▶️ Scraping & Outreach Started!');

    // Trigger immediate sequential discovery run
    triggerPipelineRun().catch((err) => console.error('[Pipeline Trigger Error]:', err));

    if (messageId) {
      const panel = await buildControlPanelData();
      await editMessageText(messageId, panel.text, panel.replyMarkup);
    }
    return;
  }

  if (data === 'engine:stop') {
    console.log('[Telegram Bot] Received engine:stop callback');
    await prisma.systemConfig.upsert({
      where: { key: 'pipelineActive' },
      update: { value: 'false' },
      create: { key: 'pipelineActive', value: 'false' },
    });
    await prisma.systemConfig.upsert({
      where: { key: 'outreachPaused' },
      update: { value: 'true' },
      create: { key: 'outreachPaused', value: 'true' },
    });

    await answerCallbackQuery(query.id, '⏹️ Scraping & Outreach Stopped!');

    if (messageId) {
      const panel = await buildControlPanelData();
      await editMessageText(messageId, panel.text, panel.replyMarkup);
    }
    return;
  }

  if (data === 'engine:stats') {
    await answerCallbackQuery(query.id, '📊 Refreshing stats...');
    const statsMsg = await buildStatsMessage();
    const chatId = query.message?.chat.id || Number(config.telegramChatId);
    await sendTelegramReply(chatId, statsMsg);
    return;
  }

  if (data === 'engine:hot') {
    await answerCallbackQuery(query.id, '🔥 Fetching hot leads...');
    const hotMsg = await buildHotLeadsMessage();
    const chatId = query.message?.chat.id || Number(config.telegramChatId);
    await sendTelegramReply(chatId, hotMsg);
    return;
  }

  if (data.startsWith('open_admin:')) {
    const leadId = data.replace('open_admin:', '').trim();
    await answerCallbackQuery(query.id);
    const chatId = query.message?.chat.id || Number(config.telegramChatId);
    await sendTelegramReply(
      chatId,
      `📂 <b>Lead Desk Link:</b>\n<a href="${config.nextPublicAppUrl}/admin?leadId=${leadId}">${config.nextPublicAppUrl}/admin?leadId=${leadId}</a>`
    );
    return;
  }

  if (data.startsWith('send_draft:')) {
    const leadId = data.replace('send_draft:', '').trim();
    console.log(`[Telegram Bot] Processing send_draft for lead: ${leadId}`);

    // Immediately answer callback so Telegram UI does not spin/hang
    await answerCallbackQuery(query.id, '⏳ Sending via Gmail...');

    try {
      const res = await fetch(`${config.nextPublicAppUrl}/api/leads/${leadId}/send-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.adminSecret}`,
        },
      });

      if (res.ok) {
        if (messageId) {
          const adminUrl = `${config.nextPublicAppUrl}/admin?leadId=${leadId}`;
          const adminBtn = isValidTelegramButtonUrl(adminUrl)
            ? { text: '✏️ Edit', url: adminUrl }
            : { text: '✏️ Edit', callback_data: `open_admin:${leadId}` };

          await editMessageReplyMarkup(messageId, {
            inline_keyboard: [
              [{ text: '✅ Sent via Gmail', callback_data: 'noop' }],
              [adminBtn],
            ],
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const chatId = query.message?.chat.id || Number(config.telegramChatId);
        await sendTelegramReply(chatId, `⚠️ Send error: ${err.error || 'Failed to send'}`);
      }
    } catch (e) {
      const chatId = query.message?.chat.id || Number(config.telegramChatId);
      await sendTelegramReply(chatId, '⚠️ Network error while sending email.');
    }
  } else if (data.startsWith('regen_draft:')) {
    const leadId = data.replace('regen_draft:', '').trim();
    console.log(`[Telegram Bot] Regenerating draft for lead: ${leadId}`);

    await answerCallbackQuery(query.id, '🔄 Generating punchier draft...');

    try {
      const res = await fetch(`${config.nextPublicAppUrl}/api/leads/${leadId}/regenerate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.adminSecret}`,
        },
      });

      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.draftReply && messageId) {
        // Fetch lead context to re-render dossier cleanly
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: { messageThreads: { orderBy: { createdAt: 'desc' }, take: 2 } },
        });

        if (lead) {
          const inboundText =
            lead.messageThreads.find((t) => t.direction === 'INBOUND')?.content || 'Interested in details';

          const sourcePart = lead.sourceUrl
            ? ` · <a href="${escapeHtml(lead.sourceUrl)}">View Source</a>`
            : '';

          const updatedDossier = [
            `🔥 <b>New Reply (Rewritten) — ${escapeHtml(lead.name)}</b>`,
            `${escapeHtml(lead.matchedService)} · ${escapeHtml(lead.platform)} · ${lead.winProbability}% win`,
            ``,
            `<b>Their message:</b>`,
            `"${escapeHtml(inboundText.slice(0, 400))}"`,
            ``,
            `<b>Suggested reply:</b>`,
            `${escapeHtml(resData.draftReply)}`,
            ``,
            `<a href="${config.nextPublicAppUrl}/admin?leadId=${leadId}">Open in Admin</a>${sourcePart}`,
          ].join('\n');

          const adminUrl = `${config.nextPublicAppUrl}/admin?leadId=${leadId}`;
          const adminBtn = isValidTelegramButtonUrl(adminUrl)
            ? { text: '✏️ Edit', url: adminUrl }
            : { text: '✏️ Edit', callback_data: `open_admin:${leadId}` };

          await editMessageText(messageId, updatedDossier, {
            inline_keyboard: [
              [
                { text: '✅ Send Reply', callback_data: `send_draft:${leadId}` },
                { text: '🔄 Rewrite', callback_data: `regen_draft:${leadId}` },
              ],
              [
                adminBtn,
                { text: '🚫 Opt-Out', callback_data: `optout:${leadId}` },
              ],
            ],
          });
        }
      }
    } catch (e) {
      console.warn('[Telegram Regen Error]:', (e as Error).message);
    }
  } else if (data.startsWith('optout:')) {
    const leadId = data.replace('optout:', '').trim();
    console.log(`[Telegram Bot] Marking lead optout: ${leadId}`);

    try {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'OPTED_OUT',
          winProbability: 0,
          nextFollowUpAt: null,
          draftStatus: 'DISCARDED',
        },
      });

      await answerCallbackQuery(query.id, '🚫 Marked Opt-Out');
      if (messageId) {
        await editMessageReplyMarkup(messageId, {
          inline_keyboard: [[{ text: '🚫 Marked Opt-Out', callback_data: 'noop' }]],
        });
      }
    } catch (e) {
      await answerCallbackQuery(query.id, '⚠️ Failed to mark opt-out');
    }
  } else {
    await answerCallbackQuery(query.id);
  }
}

/**
 * Handles incoming text messages, Slash Commands, and Swipe-Replies
 */
async function handleMessage(msg: NonNullable<TelegramUpdate['message']>) {
  const text = msg.text?.trim() || '';

  // 1. Direct Swipe-Reply Handling (message.reply_to_message)
  if (msg.reply_to_message) {
    const replyToMsgId = msg.reply_to_message.message_id;
    console.log(`[Telegram Bot] Swipe-reply detected to message_id: ${replyToMsgId}`);

    // Match lead by telegramMessageId
    let lead = await prisma.lead.findFirst({
      where: { telegramMessageId: replyToMsgId },
    });

    if (!lead && msg.reply_to_message.text) {
      // Fallback: look for lead in active status
      lead = await prisma.lead.findFirst({
        where: { status: { in: ['REPLIED', 'CONVERTED', 'IN_CONVERSATION'] } },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (lead) {
      console.log(`[Telegram Bot] Matched swipe-reply to lead: ${lead.name} (${lead.id})`);
      await sendChatAction(msg.chat.id, 'typing');

      // Strip optional 'reply:' or 'Reply:' prefix if user typed it
      const cleanReplyText = text.replace(/^reply:\s*/i, '').trim();

      try {
        const res = await fetch(`${config.nextPublicAppUrl}/api/leads/${lead.id}/send-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.adminSecret}`,
          },
          body: JSON.stringify({ content: cleanReplyText }),
        });

        if (res.ok) {
          await sendTelegramReply(
            msg.chat.id,
            `✅ Custom reply sent to ${escapeHtml(lead.name)}\n\n<i>"${escapeHtml(cleanReplyText)}"</i>`,
            msg.message_id
          );
        } else {
          const err = await res.json().catch(() => ({}));
          await sendTelegramReply(msg.chat.id, `⚠️ Failed to send: ${err.error || 'Unknown error'}`);
        }
      } catch (e) {
        await sendTelegramReply(msg.chat.id, `⚠️ Network error sending custom reply.`);
      }
      return;
    } else {
      await sendTelegramReply(
        msg.chat.id,
        `⚠️ Could not map this reply to an active prospect. Please use the <a href="${config.nextPublicAppUrl}/admin">Admin Desk</a>.`
      );
      return;
    }
  }

  // 2. Slash Commands
  if (text.startsWith('/')) {
    const cmd = text.toLowerCase().split(' ')[0];

    if (cmd === '/start' || cmd === '/control') {
      const panel = await buildControlPanelData();
      await sendTelegramReplyWithMarkup(msg.chat.id, panel.text, panel.replyMarkup);
    } else if (cmd === '/checkmail' || cmd === '/poll') {
      await sendTelegramReply(msg.chat.id, '🔍 Checking Gmail inbox right now...', msg.message_id);
      try {
        const processed = await pollGmailRepliesJob();
        await sendTelegramReply(
          msg.chat.id,
          `📬 Inbox check complete! Found & processed ${processed} reply event(s).`
        );
      } catch (err) {
        await sendTelegramReply(msg.chat.id, `⚠️ Checkmail error: ${(err as Error).message}`);
      }
      return;
    } else if (cmd === '/stats') {
      const statsMsg = await buildStatsMessage();
      await sendTelegramReply(msg.chat.id, statsMsg);
    } else if (cmd === '/hot') {
      const hotMsg = await buildHotLeadsMessage();
      await sendTelegramReply(msg.chat.id, hotMsg);
    } else if (cmd === '/summary') {
      await sendTelegramReply(msg.chat.id, '⏳ Generating daily summary digest...');
      await dailySummaryJob();
    } else if (cmd === '/pause') {
      await prisma.systemConfig.upsert({
        where: { key: 'pipelineActive' },
        update: { value: 'false' },
        create: { key: 'pipelineActive', value: 'false' },
      });
      await prisma.systemConfig.upsert({
        where: { key: 'outreachPaused' },
        update: { value: 'true' },
        create: { key: 'outreachPaused', value: 'true' },
      });
      await sendTelegramReply(
        msg.chat.id,
        '⏹️ <b>Scraping & Outreach STOPPED</b>\nAutomated lead discovery, AI audits, and cold emails are paused.\nUse /control or /resume to reactivate.'
      );
    } else if (cmd === '/resume') {
      await prisma.systemConfig.upsert({
        where: { key: 'pipelineActive' },
        update: { value: 'true' },
        create: { key: 'pipelineActive', value: 'true' },
      });
      await prisma.systemConfig.upsert({
        where: { key: 'outreachPaused' },
        update: { value: 'false' },
        create: { key: 'outreachPaused', value: 'false' },
      });
      triggerPipelineRun().catch((err) => console.error('[Pipeline Run Error]:', err));
      await sendTelegramReply(
        msg.chat.id,
        '▶️ <b>Scraping & Outreach STARTED</b>\nAutonomous lead discovery, AI audits, and outreach pass triggered!'
      );
    } else {
      await sendTelegramReply(
        msg.chat.id,
        [
          `🤖 <b>Freelance Command Bot Commands</b>`,
          ``,
          `• /control — Live scraping & outreach control panel`,
          `• /stats — Today's volume, replies & engine status`,
          `• /hot — Top 5 highest win-probability prospects`,
          `• /summary — Generate and send daily digest`,
          `• /pause — Halt automated scraping & outreach`,
          `• /resume — Start automated scraping & outreach`,
          ``,
          `<i>Or swipe-reply to any lead alert to send a custom Gmail reply.</i>`,
        ].join('\n')
      );
    }
  }
}

// Telegram API Helper Utilities
async function sendTelegramReply(chatId: number, text: string, replyToMessageId?: number) {
  const token = config.telegramBotToken;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
      }),
    });
  } catch (err) {
    console.warn('[Telegram Send Error]:', (err as Error).message);
  }
}

async function sendTelegramReplyWithMarkup(
  chatId: number,
  text: string,
  replyMarkup?: any,
  replyToMessageId?: number
) {
  const token = config.telegramBotToken;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
  } catch (err) {
    console.warn('[Telegram Send Error]:', (err as Error).message);
  }
}

async function buildControlPanelData() {
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
    `<i>Use the buttons below to control the engine.</i>`,
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

async function buildStatsMessage(): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [sentToday, repliesToday, positiveCount, activeLeads, activeConfig] = await Promise.all([
    prisma.messageThread.count({ where: { direction: 'OUTBOUND', createdAt: { gte: startOfDay } } }),
    prisma.messageThread.count({ where: { direction: 'INBOUND', createdAt: { gte: startOfDay } } }),
    prisma.messageThread.count({
      where: { direction: 'INBOUND', sentiment: 'POSITIVE_INTEREST', createdAt: { gte: startOfDay } },
    }),
    prisma.lead.findMany({
      where: { status: { not: 'OPTED_OUT' } },
      select: { winProbability: true },
    }),
    prisma.systemConfig.findUnique({ where: { key: 'pipelineActive' } }),
  ]);

  const totalLeads = activeLeads.length;
  const pipelineValueInr = activeLeads.reduce(
    (acc, l) => acc + Math.max(5000, Math.round((l.winProbability / 100) * 15000)),
    0
  );
  const formattedPipelineInr = `₹${pipelineValueInr.toLocaleString('en-IN')}`;
  const usdEquiv = Math.round(pipelineValueInr / 85).toLocaleString('en-US');

  const isRunning = activeConfig?.value === 'true';

  return [
    `📊 <b>Pipeline Statistics</b>`,
    ``,
    `• <b>24/7 Listener:</b> 🟢 Active`,
    `• <b>Outreach Engine:</b> ${isRunning ? '🟢 Running' : '🔴 Stopped'}`,
    `• <b>Pipeline Value:</b> ${formattedPipelineInr} INR (~$${usdEquiv} USD)`,
    `• <b>Sent Today:</b> ${sentToday} / 25`,
    `• <b>Replies Today:</b> ${repliesToday}`,
    `• <b>Buying Signals:</b> ${positiveCount} 🔥`,
    `• <b>Active Pipeline:</b> ${totalLeads} leads`,
    ``,
    `<a href="${config.nextPublicAppUrl}/admin">Open Admin Desk</a>`,
  ].join('\n');
}

async function buildHotLeadsMessage(): Promise<string> {
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
      return `• <a href="${config.nextPublicAppUrl}/admin?leadId=${l.id}"><b>${escapeHtml(l.name)}</b></a> — ${l.winProbability}% win · ${escapeHtml(l.matchedService.toUpperCase())} · ${clicks} clicks`;
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

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const token = config.telegramBotToken;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {}
}

async function editMessageReplyMarkup(messageId: number, replyMarkup: any) {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    });
  } catch {}
}

async function editMessageText(messageId: number, text: string, replyMarkup?: any) {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  try {
    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
}

async function sendChatAction(chatId: number | string, action: string = 'typing') {
  const token = config.telegramBotToken;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {}
}
