import cron from 'node-cron';
import { discoverLeadsJob } from './jobs/discoverLeads.js';
import { auditAndDraftJob } from './jobs/auditAndDraft.js';
import { dispatchOutreachJob } from './jobs/dispatchOutreach.js';
import { pollGmailRepliesJob } from './jobs/pollGmailReplies.js';
import { dailySummaryJob } from './jobs/dailySummary.js';
import { addJobToPipeline } from './queue.js';
import { startTelegramBotPoller } from './lib/telegramBot.js';

console.log('====================================================');
console.log('🚀 24/7 Autonomous Freelance Lead Engine Initialized');
console.log('====================================================');

process.on('uncaughtException', (err) => {
  console.warn('[Worker] Uncaught exception caught safely:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Worker] Unhandled rejection caught safely:', (reason as Error)?.message || reason);
});

async function startWorker() {
  // 1. Immediately launch Telegram Two-Way Long-Poller
  startTelegramBotPoller().catch((err) => {
    console.error('[Worker] Telegram Poller error:', err.message);
  });

  // 2. Poll Gmail Replies: Every 1 minute for near-instant alerts
  console.log('[Cron] Scheduling poll-gmail-replies (every 1 minute)...');
  cron.schedule('* * * * *', async () => {
    console.log('[Cron] Triggering poll-gmail-replies...');
    try {
      await pollGmailRepliesJob();
    } catch (e) {
      console.error('[Cron] poll-gmail-replies error:', (e as Error).message);
    }
  });

  // 3. Discover Leads: Every 15 minutes
  console.log('[Cron] Scheduling discover-leads (every 15 minutes)...');
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron] Triggering discover-leads pipeline...');
    try {
      await addJobToPipeline('discover-leads');
    } catch (e) {
      console.error('[Cron] discover-leads error:', (e as Error).message);
    }
  });

  // 4. Audit and Draft Pitches: Every 10 minutes
  console.log('[Cron] Scheduling audit-and-draft (every 10 minutes)...');
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Cron] Triggering audit-and-draft pipeline...');
    try {
      await addJobToPipeline('audit-and-draft');
    } catch (e) {
      console.error('[Cron] audit-and-draft error:', (e as Error).message);
    }
  });

  // 5. Dispatch Outreach: Every 30 minutes
  console.log('[Cron] Scheduling dispatch-outreach (every 30 minutes)...');
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Triggering dispatch-outreach pipeline...');
    try {
      await addJobToPipeline('dispatch-outreach');
    } catch (e) {
      console.error('[Cron] dispatch-outreach error:', (e as Error).message);
    }
  });

  // 6. Daily Summary: Daily at 20:00 IST (Asia/Kolkata)
  console.log('[Cron] Scheduling daily-summary (daily at 20:00 IST)...');
  cron.schedule(
    '0 20 * * *',
    async () => {
      console.log('[Cron] Triggering daily-summary digest...');
      try {
        await dailySummaryJob();
      } catch (e) {
        console.error('[Cron] daily-summary error:', (e as Error).message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('[Worker] All 5 background jobs active and listening.');

  // Run initial warmup asynchronously in background
  (async () => {
    console.log('[Worker] Running initial pipeline warmup in background...');
    try {
      await discoverLeadsJob();
      await auditAndDraftJob();
      await dispatchOutreachJob();
      await pollGmailRepliesJob();
    } catch (err) {
      console.error('[Worker] Initial warmup notice:', (err as Error).message);
    }
  })();
}

startWorker().catch((err) => {
  console.error('[Worker Fatal Error]:', err);
});
