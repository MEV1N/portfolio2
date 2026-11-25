import nodemailer from 'nodemailer';
import { prisma } from 'db';
import { config } from '../config.js';
import { isValidContactEmail } from '../utils/enrichEmail.js';

const DAILY_OUTREACH_CAP = 25;

/**
 * Job C: Dispatch Outreach Emails & Queue Social DMs
 * Strictly capped at 25/day with randomized 5-to-12-minute delay between sends.
 * Sends plain-text emails via Gmail SMTP with Message-ID tracking and opt-out line.
 */
export async function dispatchOutreachJob(): Promise<number> {
  // 0. Gated Engine Loop: runs ONLY when pipelineActive is true
  const activeConfig = await prisma.systemConfig.findUnique({
    where: { key: 'pipelineActive' },
  });
  if (activeConfig?.value !== 'true') {
    console.log('[dispatch-outreach] Pipeline is STOPPED (pipelineActive = false). Skipping dispatch.');
    return 0;
  }

  console.log('[dispatch-outreach] Verifying daily send limits and business hours...');

  // Check persistent SystemConfig pause toggle
  const pauseSetting = await prisma.systemConfig.findUnique({
    where: { key: 'outreachPaused' },
  });
  if (pauseSetting?.value === 'true') {
    console.log('[dispatch-outreach] Outreach engine is currently PAUSED via Telegram command center. Skipping dispatch.');
    return 0;
  }

  // 1. Strict Daily Cap Check
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const sentTodayCount = await prisma.lead.count({
    where: {
      status: { in: ['SENT', 'REPLIED', 'CONVERTED'] },
      updatedAt: { gte: startOfDay },
      platform: { in: ['email', 'google_maps'] },
    },
  });

  if (sentTodayCount >= DAILY_OUTREACH_CAP) {
    console.warn(
      `[dispatch-outreach] Daily cap of ${DAILY_OUTREACH_CAP} reached (${sentTodayCount} sent today). Halting dispatch.`
    );
    return 0;
  }

  const remainingQuota = DAILY_OUTREACH_CAP - sentTodayCount;
  console.log(`[dispatch-outreach] Remaining daily outreach quota: ${remainingQuota}`);

  // 2. Fetch AUDITED leads ready for outreach that have a verified email address
  const candidates = await prisma.lead.findMany({
    where: {
      status: 'AUDITED',
      contactEmailOrHandle: {
        contains: '@',
      },
    },
    include: {
      messageThreads: {
        where: { direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const eligibleEmailLeads = candidates
    .filter((l) => isValidContactEmail(l.contactEmailOrHandle))
    .slice(0, Math.min(5, remainingQuota));

  if (eligibleEmailLeads.length === 0) {
    console.log('[dispatch-outreach] No AUDITED leads with verified email addresses currently queued.');
    return 0;
  }

  // Setup Gmail nodemailer transporter
  let transporter: nodemailer.Transporter | null = null;
  if (config.gmailUser && config.gmailAppPassword) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword,
      },
    });
  }

  if (!transporter) {
    console.warn('[dispatch-outreach] Gmail transporter not configured (check GMAIL_USER and GMAIL_APP_PASSWORD). Skipping dispatch.');
    return 0;
  }

  let sentCount = 0;

  for (const lead of eligibleEmailLeads) {
    const firstName = lead.name.split(' ')[0] || 'there';
    const draftPitch =
      lead.messageThreads[0]?.content ||
      `Hey ${firstName}, came across your work and loved what you're building. You can check out some of my recent work and projects here: ${config.nextPublicAppUrl}/r/${lead.id} — would love to chat if you're open to it!`;

    // Format plain-text email with clean sign-off and opt-out
    const plainTextBody = `${draftPitch}

Best,
Mevin
${config.nextPublicAppUrl}

---
PS: If you'd rather I not reach out, just let me know and I won't email again.`;

    try {
      console.log(`[dispatch-outreach] Dispatching Gmail outreach to ${lead.contactEmailOrHandle}...`);

      let subjectTarget = lead.name;
      if (subjectTarget.includes('(') && subjectTarget.includes(')')) {
        const match = subjectTarget.match(/\((.*?)\)/)?.[1];
        if (match) subjectTarget = match;
      }
      subjectTarget = subjectTarget.replace(/\[.*?\]/g, '').trim();
      if (!subjectTarget || subjectTarget.toLowerCase() === 'inbound prospect') {
        subjectTarget = 'your project';
      }

      const info = await transporter.sendMail({
        from: `"Mevin" <${config.gmailUser}>`,
        to: lead.contactEmailOrHandle,
        subject: `Quick idea regarding ${subjectTarget}`,
        text: plainTextBody,
      });

      // Store outbound Message-ID header for reply matching
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'SENT',
          messageIdHeader: info.messageId,
          nextFollowUpAt: new Date(Date.now() + 48 * 3600 * 1000), // Follow up in 48h
          updatedAt: new Date(),
        },
      });

      sentCount++;
      console.log(`[dispatch-outreach] Sent email to ${lead.contactEmailOrHandle}. Message-ID: ${info.messageId}`);

      // Randomized 5-to-12-minute delay between sends (reduced in test/dev mode)
      const minMs = config.isDev ? 1000 : 5 * 60 * 1000;
      const maxMs = config.isDev ? 3000 : 12 * 60 * 1000;
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      console.log(`[dispatch-outreach] Waiting ${Math.round(delay / 1000)}s before next send to protect sender reputation...`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      console.error(`[dispatch-outreach] Failed to send email to ${lead.contactEmailOrHandle}:`, (err as Error).message);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'FAILED',
          auditSummary: `[Delivery Failed: ${(err as Error).message.slice(0, 100)}] ${lead.auditSummary || ''}`.slice(0, 500),
          updatedAt: new Date(),
        },
      }).catch(() => {});
    }
  }

  return sentCount;
}
