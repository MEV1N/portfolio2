import { prisma } from 'db';
import { auditAndDraftPitch } from '../lib/gemini.js';
import { fetchPageSpeedMetrics } from '../lib/pagespeed.js';
import { config } from '../config.js';

/**
 * Job B: Audit and Draft Outbound Pitches with Live PageSpeed Performance Metrics
 * Evaluates DISCOVERED prospects via Google PageSpeed Insights + Gemini.
 * Discards scores below 7, picks highest-value service, and drafts 3-sentence pitch citing verified metrics.
 */
export async function auditAndDraftJob(): Promise<number> {
  // Gated Engine Loop: runs ONLY when pipelineActive is true
  const activeConfig = await prisma.systemConfig.findUnique({
    where: { key: 'pipelineActive' },
  });
  if (activeConfig?.value !== 'true') {
    console.log('[audit-and-draft] Pipeline is STOPPED (pipelineActive = false). Skipping run.');
    return 0;
  }

  console.log('[audit-and-draft] Scanning for DISCOVERED prospects...');

  const pendingLeads = await prisma.lead.findMany({
    where: { status: 'DISCOVERED' },
    take: 10,
    orderBy: { createdAt: 'asc' },
  });

  if (pendingLeads.length === 0) {
    console.log('[audit-and-draft] No pending DISCOVERED leads to audit.');
    return 0;
  }

  let auditedCount = 0;

  for (const lead of pendingLeads) {
    try {
      console.log(`[audit-and-draft] Auditing lead: ${lead.name} (${lead.id})...`);

      // 1. Check for valid website URL for real keyless PageSpeed inspection
      const candidateUrl = lead.sourceUrl || lead.auditSummary || '';
      const pageSpeedMetrics = await fetchPageSpeedMetrics(candidateUrl);

      if (pageSpeedMetrics) {
        console.log(
          `[audit-and-draft] PageSpeed Insights for ${lead.name}: Perf ${pageSpeedMetrics.performanceScore}/100 | LCP: ${pageSpeedMetrics.lcp} | TTFB: ${pageSpeedMetrics.ttfb}`
        );
      }

      // 2. Draft hyper-personalized pitch with Gemini citing verified metrics
      const audit = await auditAndDraftPitch(
        lead.name,
        lead.platform,
        lead.sourceUrl || lead.auditSummary,
        lead.id,
        pageSpeedMetrics
      );

      if (!audit) continue;

      if (audit.fitScore < 7) {
        // Discard low-fit, hobbyist, or sub-₹5,000 budget prospects
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: 'REJECTED',
            fitScore: audit.fitScore,
            auditSummary: `Discarded (Fit Score ${audit.fitScore} < 7): ${audit.auditSummary}`,
          },
        });
        console.log(`[audit-and-draft] Lead ${lead.name} discarded due to low fit score / sub-₹5,000 budget (${audit.fitScore}).`);
        continue;
      }

      const verifiedSummary = pageSpeedMetrics
        ? `[Mobile LCP: ${pageSpeedMetrics.lcp} | TTFB: ${pageSpeedMetrics.ttfb} | Perf: ${pageSpeedMetrics.performanceScore}/100] ${audit.auditSummary}`
        : audit.auditSummary;

      // 3. Save audit and create draft outbound thread
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: 'AUDITED',
            fitScore: audit.fitScore,
            matchedService: audit.matchedService,
            auditSummary: verifiedSummary,
            winProbability: Math.min(60, lead.winProbability + (pageSpeedMetrics ? 20 : 15)),
          },
        });

        await tx.messageThread.create({
          data: {
            leadId: lead.id,
            direction: 'OUTBOUND',
            content: audit.threeSentencePitch,
            sentiment: null,
            portfolioClicks: 0,
          },
        });
      });

      auditedCount++;
      console.log(`[audit-and-draft] Lead ${lead.name} audited successfully -> Matched: ${audit.matchedService}`);
    } catch (err) {
      console.error(`[audit-and-draft] Error auditing lead ${lead.id}:`, (err as Error).message);
    }
  }

  return auditedCount;
}
