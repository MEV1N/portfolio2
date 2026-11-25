import { prisma } from 'db';
import { sendTelegramDailySummary, escapeHtml } from '../lib/telegram.js';
import { config } from '../config.js';

/**
 * Job E: Daily Summary & Telegram Digest
 * Runs daily at 20:00 IST (Asia/Kolkata).
 * Aggregates sent outreach, received replies, high-probability leads, saves DailyReport,
 * and sends formatted summary digest to Telegram.
 */
export async function dailySummaryJob(): Promise<void> {
  console.log('[daily-summary] Generating daily outreach performance digest...');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // 1. Metrics aggregation
  const [totalSent, totalReplies, positiveReplies, highProbabilityLeads, activeLeads] = await Promise.all([
    prisma.messageThread.count({
      where: {
        direction: 'OUTBOUND',
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.messageThread.count({
      where: {
        direction: 'INBOUND',
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.messageThread.count({
      where: {
        direction: 'INBOUND',
        sentiment: 'POSITIVE_INTEREST',
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.lead.findMany({
      where: {
        winProbability: { gte: 70 },
      },
      orderBy: { winProbability: 'desc' },
      take: 5,
    }),
    prisma.lead.findMany({
      where: {
        status: { not: 'OPTED_OUT' },
      },
      select: { winProbability: true },
    }),
  ]);

  // Sprint baseline pricing starts at ₹5,000 INR; average project estimated at ₹15,000 INR (~$180 USD)
  const totalPipelineInr = activeLeads.reduce(
    (acc, l) => acc + Math.max(5000, Math.round((l.winProbability / 100) * 15000)),
    0
  );
  const formattedPipelineInr = `₹${totalPipelineInr.toLocaleString('en-IN')}`;
  const usdEquiv = Math.round(totalPipelineInr / 85).toLocaleString('en-US');

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const summaryText = `Daily Report for ${dateStr}: Pipeline value ${formattedPipelineInr} INR. ${totalSent} pitches sent, ${totalReplies} replies received, ${positiveReplies} high-intent conversations initiated. ${highProbabilityLeads.length} leads above 70% win probability.`;

  // 2. Persist DailyReport in PostgreSQL
  await prisma.dailyReport.upsert({
    where: { date: startOfDay },
    update: {
      totalSent,
      totalReplies,
      positiveReplies,
      summaryText,
    },
    create: {
      date: startOfDay,
      totalSent,
      totalReplies,
      positiveReplies,
      summaryText,
    },
  });

  // 3. Format Telegram Digest
  const appUrl = config.nextPublicAppUrl || 'http://localhost:3000';
  const leadLines =
    highProbabilityLeads.length > 0
      ? highProbabilityLeads
          .map(
            (l) =>
              `• <a href="${appUrl}/admin?leadId=${l.id}"><b>${escapeHtml(l.name)}</b></a> (${escapeHtml(l.platform)}) — ${l.winProbability}% win · ${escapeHtml(l.matchedService.toUpperCase())}`
          )
          .join('\n')
      : '• No leads currently above 70%';

  const digestMessage = [
    `📊 <b>Daily Lead-Gen Summary — ${escapeHtml(dateStr)}</b>`,
    ``,
    `• <b>Estimated Pipeline Value:</b> ${formattedPipelineInr} INR (~$${usdEquiv} USD)`,
    `• <b>Pitches Dispatched:</b> ${totalSent} / 25`,
    `• <b>Inbound Replies:</b> ${totalReplies}`,
    `• <b>High-Intent Signals:</b> ${positiveReplies} 🔥`,
    ``,
    `<b>Top High-Probability Leads:</b>`,
    leadLines,
    ``,
    `<a href="${appUrl}/admin">Open Admin Desk</a>`,
  ].join('\n');

  // 4. Send to Telegram
  await sendTelegramDailySummary(digestMessage);
  console.log('[daily-summary] Daily report generated and saved.');
}
