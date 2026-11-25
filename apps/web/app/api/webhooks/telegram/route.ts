import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import {
  buildControlPanelData,
  buildStatsMessage,
  buildHotLeadsMessage,
  editTelegramMessage,
  editTelegramReplyMarkup,
  answerTelegramCallbackQuery,
  sendTelegramMessage,
  escapeMarkdown,
  escapeHtml,
  isValidTelegramButtonUrl,
} from '@/lib/telegram';

/**
 * Telegram Webhook Handler (POST /api/webhooks/telegram)
 * Verified against X-Telegram-Bot-Api-Secret-Token
 */
export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret =
    process.env.TELEGRAM_WEBHOOK_SECRET || process.env.ADMIN_SECRET;

  if (expectedSecret && secretHeader !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 });
  }

  try {
    const update = await req.json();

    // 1. Handle Inline Button Callbacks
    if (update.callback_query) {
      const query = update.callback_query;
      const data = query.data || '';
      const messageId = query.message?.message_id;

      if (data === 'engine:start') {
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

        await answerTelegramCallbackQuery(query.id, '▶️ Scraping & Outreach Started!');
        if (messageId) {
          const panel = await buildControlPanelData();
          await editTelegramMessage(messageId, panel.text, panel.replyMarkup);
        }
      } else if (data === 'engine:stop') {
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

        await answerTelegramCallbackQuery(query.id, '⏹️ Scraping & Outreach Stopped!');
        if (messageId) {
          const panel = await buildControlPanelData();
          await editTelegramMessage(messageId, panel.text, panel.replyMarkup);
        }
      } else if (data === 'engine:stats') {
        await answerTelegramCallbackQuery(query.id, '📊 Refreshing stats...');
        const stats = await buildStatsMessage();
        const chatId = query.message?.chat.id || process.env.TELEGRAM_CHAT_ID;
        if (chatId) await sendTelegramMessage(chatId, stats);
      } else if (data === 'engine:hot') {
        await answerTelegramCallbackQuery(query.id, '🔥 Loading hot leads...');
        const hot = await buildHotLeadsMessage();
        const chatId = query.message?.chat.id || process.env.TELEGRAM_CHAT_ID;
        if (chatId) await sendTelegramMessage(chatId, hot);
      } else if (data.startsWith('open_admin:')) {
        const leadId = data.replace('open_admin:', '').trim();
        await answerTelegramCallbackQuery(query.id);
        const chatId = query.message?.chat.id || process.env.TELEGRAM_CHAT_ID;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        if (chatId) {
          await sendTelegramMessage(
            chatId,
            `📂 <b>Lead Desk Link:</b>\n<a href="${appUrl}/admin?leadId=${leadId}">${appUrl}/admin?leadId=${leadId}</a>`
          );
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('send_draft:')) {
        const leadId = data.replace('send_draft:', '').trim();
        await answerTelegramCallbackQuery(query.id, '⏳ Sending via Gmail...');
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const res = await fetch(`${appUrl}/api/leads/${leadId}/send-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
          },
        });
        if (res.ok) {
          if (messageId) {
            const adminUrl = `${appUrl}/admin?leadId=${leadId}`;
            const adminBtn = isValidTelegramButtonUrl(adminUrl)
              ? { text: '✏️ Edit', url: adminUrl }
              : { text: '✏️ Edit', callback_data: `open_admin:${leadId}` };

            await editTelegramReplyMarkup(messageId, {
              inline_keyboard: [
                [{ text: '✅ Sent via Gmail', callback_data: 'noop' }],
                [adminBtn],
              ],
            });
          }
        } else {
          await answerTelegramCallbackQuery(query.id, '⚠️ Failed to send');
        }
      } else if (data.startsWith('social_sent:')) {
        const leadId = data.replace('social_sent:', '').trim();
        await answerTelegramCallbackQuery(query.id, '✅ DM logged as sent!');

        try {
          const lead = await prisma.lead.findUnique({
            where: { id: leadId },
          });

          if (lead) {
            const nextFollowUpAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

            await prisma.$transaction(async (tx) => {
              await tx.messageThread.create({
                data: {
                  leadId: lead.id,
                  direction: 'OUTBOUND',
                  content: lead.draftReply || 'Sent Reddit direct message.',
                  sentiment: null,
                  portfolioClicks: 0,
                },
              });

              await tx.lead.update({
                where: { id: lead.id },
                data: {
                  status: 'CONTACTED',
                  nextFollowUpAt,
                  draftStatus: 'SENT',
                },
              });
            });

            if (messageId) {
              const cleanHandle = lead.contactEmailOrHandle
                .replace(/^u\//i, '')
                .replace(/^@/, '')
                .trim() || 'redditor';
              const authorProfileUrl = `https://www.reddit.com/user/${cleanHandle}`;
              const sourcePostUrl = isValidTelegramButtonUrl(lead.sourceUrl)
                ? lead.sourceUrl!
                : 'https://www.reddit.com';

              await editTelegramReplyMarkup(messageId, {
                inline_keyboard: [
                  [{ text: '✅ DM Logged as Sent', callback_data: 'noop' }],
                  [
                    { text: '🔗 Open Post', url: sourcePostUrl },
                    { text: '👤 Author Profile', url: authorProfileUrl },
                  ],
                ],
              });
            }
          }
        } catch (e) {
          console.error(`[Telegram Webhook] Error logging social_sent for ${leadId}:`, e);
        }
      } else if (data.startsWith('optout:')) {
        const leadId = data.replace('optout:', '').trim();
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'OPTED_OUT',
            winProbability: 0,
            nextFollowUpAt: null,
            draftStatus: 'DISCARDED',
          },
        });
        await answerTelegramCallbackQuery(query.id, '🚫 Marked Opt-Out');
        if (messageId) {
          await editTelegramReplyMarkup(messageId, {
            inline_keyboard: [[{ text: '🚫 Marked Opt-Out', callback_data: 'noop' }]],
          });
        }
      } else {
        await answerTelegramCallbackQuery(query.id);
      }

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Text Messages & Slash Commands
    if (update.message?.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const chatId = msg.chat.id;

      // Handle swipe reply
      if (msg.reply_to_message) {
        const replyToMsgId = msg.reply_to_message.message_id;
        let lead = await prisma.lead.findFirst({
          where: { telegramMessageId: replyToMsgId },
        });
        if (!lead && msg.reply_to_message.text) {
          lead = await prisma.lead.findFirst({
            where: { status: { in: ['REPLIED', 'CONVERTED', 'IN_CONVERSATION'] } },
            orderBy: { updatedAt: 'desc' },
          });
        }
        if (lead) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const cleanReplyText = text.replace(/^reply:\s*/i, '').trim();

          await fetch(`${appUrl}/api/leads/${lead.id}/send-reply`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
            },
            body: JSON.stringify({ content: cleanReplyText }),
          });
          await sendTelegramMessage(
            chatId,
            `✅ Custom reply sent to ${escapeHtml(lead.name)}\n\n<i>"${escapeHtml(cleanReplyText)}"</i>`,
            undefined,
            msg.message_id
          );
          return NextResponse.json({ ok: true });
        }
      }

      // Handle commands
      if (text.startsWith('/')) {
        const cmd = text.toLowerCase().split(' ')[0];
        if (cmd === '/start' || cmd === '/control') {
          const panel = await buildControlPanelData();
          await sendTelegramMessage(chatId, panel.text, panel.replyMarkup);
        } else if (cmd === '/stats') {
          const stats = await buildStatsMessage();
          await sendTelegramMessage(chatId, stats);
        } else if (cmd === '/hot') {
          const hot = await buildHotLeadsMessage();
          await sendTelegramMessage(chatId, hot);
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
          await sendTelegramMessage(chatId, '⏹️ *Scraping & Outreach STOPPED.*\nUse `/control` or `/resume` to reactivate.');
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
          await sendTelegramMessage(chatId, '▶️ *Scraping & Outreach STARTED.*');
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
