import nodemailer from 'nodemailer';
import { prisma } from 'db';
import { config } from '../config.js';
import { isValidContactEmail } from '../utils/enrichEmail.js';

const DAILY_OUTREACH_CAP = 25;

/**
 * Validates that current time falls between 08:00 and 22:30 IST (Asia/Kolkata).
 * Widen window covers Indian business hours and aligns with US/EU morning hours for global prospects.
 */
export function isWithinSendingWindowIST(date: Date = new Date()): { inWindow: boolean; currentIST: string } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const currentIST = formatter.format(date);
  const [hourStr, minStr] = currentIST.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const totalMinutes = hour * 60 + min;

  // 08:00 = 480 min; 22:30 = 1350 min
  const inWindow = totalMinutes >= 480 && totalMinutes <= 1350;
  return { inWindow, currentIST };
}

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
    console.log('[dispatch-outreach] Skipped: pipelineActive is false (scraping & outreach engine is stopped in systemConfig).');
    return 0;
  }

  // Check persistent SystemConfig pause toggle
  const pauseSetting = await prisma.systemConfig.findUnique({
    where: { key: 'outreachPaused' },
  });
  if (pauseSetting?.value === 'true') {
    console.log('[dispatch-outreach] Skipped: outreachPaused is true (outreach engine is paused via Telegram command center).');
    return 0;
  }

  // Verify business hours window (08:00 – 22:30 IST)
  const { inWindow, currentIST } = isWithinSendingWindowIST();
  if (!inWindow) {
    console.log(
      `[dispatch-outreach] Skipped: outside sending window. Current time is ${currentIST} IST (allowed window: 08:00 – 22:30 IST).`
    );
    return 0;
  }

  console.log(`[dispatch-outreach] Within active sending window (${currentIST} IST). Verifying daily send limits...`);

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
      `[dispatch-outreach] Skipped: daily cap 25/25 reached (${sentTodayCount} sent today). Halting dispatch until tomorrow.`
    );
    return 0;
  }

  const remainingQuota = DAILY_OUTREACH_CAP - sentTodayCount;
  console.log(`[dispatch-outreach] Remaining daily outreach quota: ${remainingQuota} (${sentTodayCount}/${DAILY_OUTREACH_CAP} sent today)`);

  // 2. Fetch AUDITED leads ready for outreach that have an email address
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

  if (candidates.length === 0) {
    console.log('[dispatch-outreach] Skipped: no AUDITED leads with "@" in contactEmailOrHandle found in database.');
    return 0;
  }

  const eligibleEmailLeads = candidates
    .filter((l) => isValidContactEmail(l.contactEmailOrHandle))
    .slice(0, Math.min(5, remainingQuota));

  if (eligibleEmailLeads.length === 0) {
    console.log(
      `[dispatch-outreach] Skipped: found ${candidates.length} AUDITED candidate(s), but none passed isValidContactEmail (no valid public business/personal email address).`
    );
    return 0;
  }

  // Setup Gmail nodemailer transporter (check config + direct process.env fallback)
  const gmailUser = config.gmailUser || process.env.GMAIL_USER;
  const gmailPass = config.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.warn(
      `[dispatch-outreach] Skipped: missing Gmail credentials (GMAIL_USER: ${gmailUser ? 'configured' : 'MISSING'}, GMAIL_APP_PASSWORD: ${gmailPass ? 'configured' : 'MISSING'}). Check root .env file.`
    );
    return 0;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

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
        from: `"Mevin" <${gmailUser}>`,
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
