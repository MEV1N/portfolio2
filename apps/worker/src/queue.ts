import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from 'db';
import { config } from './config.js';
import { discoverLeadsJob } from './jobs/discoverLeads.js';
import { auditAndDraftJob } from './jobs/auditAndDraft.js';
import { dispatchOutreachJob } from './jobs/dispatchOutreach.js';

let redisClient: Redis | null = null;
let leadQueue: Queue | null = null;
let leadWorker: Worker | null = null;

// Initialize Redis if a valid connection string is provided
try {
  const isRedisUrlValid =
    config.redisUrl &&
    (config.redisUrl.startsWith('redis://') || config.redisUrl.startsWith('rediss://'));

  if (isRedisUrlValid) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    redisClient.on('error', (err) => {
      console.warn('[Redis] Connection warning (running in resilient standalone mode):', err.message);
    });

    leadQueue = new Queue('lead-pipeline', {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });

    leadWorker = new Worker(
      'lead-pipeline',
      async (job: Job) => {
        console.log(`[BullMQ Worker] Processing job: ${job.name} (ID: ${job.id})`);
        switch (job.name) {
          case 'discover-leads':
            return await discoverLeadsJob();
          case 'audit-and-draft':
            return await auditAndDraftJob();
          case 'dispatch-outreach':
            return await dispatchOutreachJob();
          default:
            console.warn(`[BullMQ Worker] Unknown job type: ${job.name}`);
        }
      },
      {
        connection: redisClient,
        concurrency: 2,
      }
    );

    leadWorker.on('completed', (job) => {
      console.log(`[BullMQ Worker] Job ${job.id} (${job.name}) completed successfully.`);
    });

    leadWorker.on('failed', (job, err) => {
      console.error(`[BullMQ Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
    });

    console.log('[BullMQ] Distributed Queue & Worker initialized.');
  } else {
    console.log('[BullMQ] Redis URL not a direct URI. Running in embedded resilient scheduling mode.');
  }
} catch (e) {
  console.warn('[BullMQ] Initialization notice:', (e as Error).message);
}

export async function addJobToPipeline(name: string, data = {}) {
  if (leadQueue) {
    try {
      await leadQueue.add(name, data);
      return;
    } catch {
      // Fallback
    }
  }

  // Resilient direct fallback execution
  if (name === 'discover-leads') await discoverLeadsJob();
  else if (name === 'audit-and-draft') await auditAndDraftJob();
  else if (name === 'dispatch-outreach') await dispatchOutreachJob();
}

/**
 * Triggers an immediate run of the pipeline when toggled active.
 * Checks for waiting AUDITED email leads and prioritizes dispatchOutreach immediately without waiting for cron.
 */
export async function triggerPipelineRun(): Promise<void> {
  console.log('[Pipeline Trigger] Immediate discovery & outreach pass triggered.');
  try {
    const pendingAuditedCount = await prisma.lead.count({
      where: {
        status: 'AUDITED',
        contactEmailOrHandle: { contains: '@' },
      },
    });

    if (pendingAuditedCount > 0) {
      console.log(`[Pipeline Trigger] Found ${pendingAuditedCount} AUDITED leads ready for outreach. Prioritizing immediate dispatchOutreach...`);
      await addJobToPipeline('dispatch-outreach');
    }

    await addJobToPipeline('discover-leads');
    await addJobToPipeline('audit-and-draft');

    if (pendingAuditedCount === 0) {
      await addJobToPipeline('dispatch-outreach');
    }
  } catch (err) {
    console.error('[Pipeline Trigger Error]:', err);
  }
}

export { leadQueue, leadWorker };
