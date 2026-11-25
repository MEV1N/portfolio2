import { config } from '../config.js';
import type { PageSpeedMetrics } from './pagespeed.js';

export interface AuditResult {
  fitScore: number; // 1-10
  matchedService: 'web' | 'video' | 'design';
  auditSummary: string;
  threeSentencePitch: string;
}

export function isSubBudgetOrHobbyist(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/homework|assignment|student project|unpaid|equity only|for free|rev share only/i.test(lower)) return true;

  // Reject micro-tasks under $55 USD (e.g. $10, $25, $50)
  const budgetMatch = lower.match(/\$\s*(\d{1,4})/);
  if (budgetMatch && budgetMatch[1]) {
    const val = parseInt(budgetMatch[1], 10);
    if (val > 0 && val < 55) return true;
  }

  // Reject micro-tasks under ₹5,000 INR (e.g. ₹500, ₹1000, ₹1500, ₹2000, ₹3000, ₹4000, 1k inr, 2k inr, 4k inr)
  const inrKMatch = lower.match(/(?:rs\.?|inr|₹)\s*(\d+)\s*k\b/i) || lower.match(/\b(\d+)\s*k\s*(?:rs\.?|inr|₹)/i);
  if (inrKMatch && inrKMatch[1]) {
    const kVal = parseInt(inrKMatch[1], 10) * 1000;
    if (kVal > 0 && kVal < 5000) return true;
  }

  const inrMatch = lower.match(/(?:rs\.?|inr|₹)\s*(\d{3,6})/i);
  if (inrMatch && inrMatch[1]) {
    const val = parseInt(inrMatch[1], 10);
    if (val > 0 && val < 5000) return true;
  }

  return false;
}

// Backward-compatible alias
export const isSub500BudgetOrHobbyist = isSubBudgetOrHobbyist;

export function extractFirstName(rawName: string): string {
  if (!rawName) return 'there';
  let clean = rawName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  clean = clean.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, '');
  const first = clean.split(/\s+/)[0];
  if (!first || first.length < 2 || /^(the|a|an|admin|info|contact|support|team|clinic|studio|inc|llc|user)$/i.test(first)) {
    return 'there';
  }
  return first;
}

/**
 * Audits a prospect using gemini-3.5-flash-lite (with fallback to gemini-3.8-flash)
 * Includes exponential backoff for HTTP 429 and 503 rate limits.
 */
export async function auditAndDraftPitch(
  leadName: string,
  platform: string,
  sourceUrl: string | null,
  leadId: string,
  metrics?: PageSpeedMetrics | null
): Promise<AuditResult | null> {
  const apiKey = config.geminiApiKey;
  const firstName = extractFirstName(leadName);

  if (!apiKey) {
    console.warn('[Gemini Worker] Missing GEMINI_API_KEY. Using heuristic auditor.');
    return heuristicAuditor(leadName, platform, leadId, sourceUrl);
  }

  const verifiedMetricsContext = metrics
    ? `
PageSpeed measurement for ${metrics.testedUrl}:
- Mobile performance: ${metrics.performanceScore}/100
- Main hero content load time: ${metrics.lcp}
- Initial server response time: ${metrics.ttfb}
`
    : '';

  const prompt = `You are Mevin, a friendly solo fullstack developer, video editor, and designer writing a quick, warm, and personal email to a founder or creator.

Prospect Name: ${leadName}
First Name: ${firstName}
Platform: ${platform}
Website / Context: ${sourceUrl || 'Digital project'}
${verifiedMetricsContext}

Instructions:
1. COMMERCIAL PRE-QUALIFICATION & MINIMUM BUDGET FILTER (₹5,000 INR / $55 USD):
   - AUTOMATIC DISCARD (fitScore < 7):
     If the context mentions a micro-budget under ₹5,000 INR or under $55 USD (e.g. $10, $25, $50, ₹1,000, ₹1,500, ₹2,500), or asks for homework/student assignments, unpaid equity-only splits, or vague "cheap/quick fix" requests, you MUST return a fitScore between 1 and 4, set auditSummary to "Discarded: Budget under ₹5,000 / $55 or non-commercial micro-task.", and return an empty threeSentencePitch.
   - COMMERCIAL SIGNAL BOOST:
     Boost fitScore by +2 points (up to 10) for verified commercial signals: live SaaS products, Show HN / Product Hunt launches, funded teams, Indian startups, agencies needing overflow dev/video support, or slow mobile loading times. Accept and prioritize budgets of ₹5,000+ (or $55+) and posts without an explicit budget number that show clear commercial/startup intent.
   - Otherwise, score client fit from 1 to 10 (fitScore). If the fit is below 7, return fitScore < 7.
2. Select the single service that helps them most: "web", "video", or "design".
3. Write an auditSummary (1 simple, clear sentence describing what could be improved).
4. Draft a warm, friendly 3-sentence email pitch:
   - Greeting: "Hey ${firstName}," (DO NOT call them Marcus unless the first name above is literally Marcus).
   - Sentence 1: A genuine, friendly compliment about what they are building or their content. Sound like a real person writing a direct email, NOT an AI bot or corporate agency.
   - Sentence 2: A simple, non-jargony observation of an area they could improve. If page load metrics are provided above, mention naturally that the mobile page takes about ${metrics?.lcp || 'a few seconds'} to load the main banner, which might cause people to click away. Strictly NO buzzwords, NO acronyms (avoid TTFB, LCP, SSR, etc.), NO robotic phrases like "audited your digital presence", "sub-200ms architecture", or "bottlenecks".
   - Sentence 3: A friendly, low-pressure invite to check out similar work and chat: "Put together a few similar projects and demos you can check out here: ${config.nextPublicAppUrl}/r/${leadId} — let me know if you'd be open to a quick 5-min chat next week!"
   - NO PRICING IN PITCH: Do NOT quote or mention pricing or rates in the cold pitch. Pricing is discussed and finalized personally on a call after project scope is established.

Respond ONLY in valid JSON format:
{
  "fitScore": 8,
  "matchedService": "web" | "video" | "design",
  "auditSummary": "...",
  "threeSentencePitch": "..."
}`;

  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  for (const model of models) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            const parsed = JSON.parse(raw);
            return {
              fitScore: Number(parsed.fitScore) || 8,
              matchedService: ['web', 'video', 'design'].includes(parsed.matchedService)
                ? parsed.matchedService
                : 'web',
              auditSummary: parsed.auditSummary || 'High-potential engineering sprint candidate.',
              threeSentencePitch: parsed.threeSentencePitch || `Hey, noticed your site could benefit from sub-200ms Next.js optimizations. See our case studies: ${config.nextPublicAppUrl}/r/${leadId}`,
            };
          }
        }

        if (res.status === 429 || res.status === 503) {
          const backoff = 1200 * Math.pow(2, attempt) + Math.random() * 500;
          console.warn(`[Gemini Worker ${model}] Status ${res.status}. Backing off ${Math.round(backoff)}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      } catch (err: unknown) {
        console.warn(`[Gemini Worker ${model}] Error: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  return heuristicAuditor(leadName, platform, leadId, sourceUrl);
}

function heuristicAuditor(
  leadName: string,
  platform: string,
  leadId: string,
  context?: string | null
): AuditResult {
  // Reject sub-₹5,000 ($55) budgets or homework/unpaid splits
  if (isSubBudgetOrHobbyist(leadName) || isSubBudgetOrHobbyist(context)) {
    return {
      fitScore: 4,
      matchedService: 'web',
      auditSummary: 'Discarded: Budget under ₹5,000 / $55 or non-commercial micro-task.',
      threeSentencePitch: '',
    };
  }

  let matchedService: 'web' | 'video' | 'design' = 'web';
  if (platform.toLowerCase().includes('youtube')) matchedService = 'video';
  if (platform.toLowerCase().includes('instagram') || platform.toLowerCase().includes('x')) matchedService = 'design';

  const firstName = extractFirstName(leadName);
  const greeting = firstName !== 'there' ? `Hey ${firstName},` : 'Hey there,';
  const isIndian = /inr|₹|\.in\b|india|kochi|bengaluru|bangalore|mumbai|hyderabad|delhi/i.test(`${leadName} ${context || ''}`);

  return {
    fitScore: 8,
    matchedService,
    auditSummary: `Identified an opportunity to improve user experience and speed on ${platform}.`,
    threeSentencePitch: `${greeting} came across your work on ${platform} and really loved what you're building. Noticed a few quick tweaks to page speed and mobile flow that could help visitors stick around longer. Put together a few similar projects and live demos here: ${config.nextPublicAppUrl}/r/${leadId} — let me know if you'd be open to a quick 5-min chat!`,
  };
}
