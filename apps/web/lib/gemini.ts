export type ReplySentiment =
  | 'POSITIVE_INTEREST'
  | 'OBJECTION_OR_QUESTION'
  | 'NEUTRAL_AUTO_REPLY'
  | 'NEGATIVE_OPT_OUT';

interface ClassificationResult {
  sentiment: ReplySentiment;
  explanation: string;
}

export interface DraftReplyParams {
  leadName: string;
  matchedService: string;
  auditSummary: string | null;
  portfolioClicks: number;
  threadHistory: Array<{ direction: string; content: string }>;
  isAlternativeAngle?: boolean;
}

/**
 * Classifies an inbound reply using gemini-3.5-flash-lite (with fallback to gemini-3.8-flash)
 * Includes exponential backoff for HTTP 429/503 rate limits.
 */
export async function classifyInboundReply(replyText: string): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini] Missing GEMINI_API_KEY, falling back to rule-based classification.');
    return ruleBasedClassification(replyText);
  }

  const prompt = `You are an AI sales reply classifier for a high-end freelance consultant.
Analyze this client reply to our cold outreach:
"""
${replyText}
"""

Classify the reply into EXACTLY ONE of the following four categories:
1. POSITIVE_INTEREST: Prospect is interested, asking for a call, proposal, quote, timeline, availability, or asking to see a sample/demo.
2. OBJECTION_OR_QUESTION: Prospect has questions, doubts, asks for pricing before committing, asks how we found them, or expresses mild skepticism.
3. NEUTRAL_AUTO_REPLY: Out of office, automated vacation responder, delivery notification, unsubscribe bot.
4. NEGATIVE_OPT_OUT: Explicit unsubscribe, "not interested", "stop emailing", angry reply, or spam report.

Return JSON in this format ONLY:
{
  "sentiment": "POSITIVE_INTEREST" | "OBJECTION_OR_QUESTION" | "NEUTRAL_AUTO_REPLY" | "NEGATIVE_OPT_OUT",
  "explanation": "Brief 1-sentence reason"
}`;

  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            if (isValidSentiment(parsed.sentiment)) {
              return {
                sentiment: parsed.sentiment,
                explanation: parsed.explanation || 'Classified by Gemini AI',
              };
            }
          }
        }

        if (res.status === 429 || res.status === 503) {
          const backoff = 800 * attempt;
          console.warn(`[Gemini ${model}] Rate limited (${res.status}). Retrying in ${backoff}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      } catch (err: unknown) {
        console.warn(`[Gemini ${model}] Attempt ${attempt} notice: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // Fast rule-based classification fallback
  return ruleBasedClassification(replyText);
}

export function extractCleanReplyBody(text: string): string {
  if (!text) return '';
  const cutoffs = [
    /\r?\nOn\s+[A-Za-z]+,\s+[0-9]+.+?wrote:\s*$/ms,
    /\r?\nOn\s+.+?wrote:/i,
    /\r?\n-{3,}\s*Original Message\s*-{3,}/i,
    /\r?\n_{3,}/,
    /\r?\nFrom:\s+.+?\r?\nSent:/i,
  ];

  let cleaned = text;
  for (const regex of cutoffs) {
    const match = cleaned.search(regex);
    if (match !== -1) {
      cleaned = cleaned.slice(0, match);
    }
  }

  // Remove blockquote lines starting with >
  cleaned = cleaned
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n');

  return cleaned.trim() || text.trim();
}

export function extractFirstName(rawName: string): string {
  if (!rawName) return 'there';
  // Strip company / platform in parentheses or brackets e.g. "Marcus Vance (Apex Cloud)" -> "Marcus"
  let clean = rawName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  // Strip professional prefixes
  clean = clean.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, '');
  const first = clean.split(/\s+/)[0];
  if (!first || first.length < 2 || /^(the|a|an|admin|info|contact|support|team|clinic|studio|inc|llc|user)$/i.test(first)) {
    return 'there';
  }
  return first;
}

/**
 * Drafts a contextual response with clean paragraphs and professional framing
 */
export async function draftContextualReply(params: DraftReplyParams): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const firstName = extractFirstName(params.leadName);

  const cleanHistory = params.threadHistory
    .map((t) => ({
      speaker: t.direction === 'INBOUND' ? firstName : 'Mevin',
      text: extractCleanReplyBody(t.content),
    }))
    .filter((t) => t.text.length > 0);

  const threadSummary = cleanHistory
    .map((t) => `${t.speaker}: "${t.text}"`)
    .join('\n\n');

  const angleInstruction = params.isAlternativeAngle
    ? 'Propose two concrete time windows to jump on a quick 10-minute call this week.'
    : 'Answer their exact question directly in 1-2 conversational sentences, then suggest a brief 10-minute sync.';

  if (!apiKey) {
    return generateFallbackDraft(firstName, params);
  }

  const prompt = `You are Mevin, a solo fullstack developer & video creator texting/replying back to a client inquiry.
Draft a quick, natural response to this prospect.

Prospect First Name: ${firstName}
Full Identifier: ${params.leadName}
Service: ${params.matchedService}

Recent Conversation:
${threadSummary}

STRICT RULES:
1. LENGTH: Exactly 2 to 3 short, conversational sentences max (strictly under 55 words total).
2. GREETING: Open with "Hey ${firstName}," or "Hi ${firstName},". NEVER use "Marcus" unless their first name is literally Marcus.
3. DIRECTNESS:
   - Answer ONLY what the prospect asked.
   - If they ask for a call or availability, confirm interest and propose 2 concrete time windows (e.g. "I'm free Thursday at 2 PM or Friday at 11 AM EST if either works?").
   - NEVER invent excuses (do NOT mention bounced emails, technical glitches, or delivery issues).
   - NEVER repeat the original cold pitch or audit summary.
   - Do NOT bring up pricing or quote rates. If they explicitly ask about pricing, say that projects are tailored to scope and propose a quick 10-minute call to understand their needs before quoting.
4. TONE:
   - Sound like a real solo developer/creator texting a colleague.
   - NO buzzwords (no "performance sprints", "synergy", "value-add", "double your conversion").
   - NO exclamation mark spam.
   - NO AI clichés ("I hope this email finds you well", "It is great to hear from you", "I would be thrilled to").
5. SIGN OFF:
   End with:
   Best,
   Mevin

${angleInstruction}

Plain text only. No markdown formatting, no bullet points, no brackets.

Respond ONLY with the complete drafted reply.`;

  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: params.isAlternativeAngle ? 0.3 : 0.15,
                maxOutputTokens: 250,
              },
            }),
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          let reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (reply && reply.length > 20) {
            if (!reply.includes('Mevin')) {
              reply = `${reply}\n\nBest,\nMevin`;
            }
            return reply;
          }
        }
      } catch (err: unknown) {
        console.warn(`[Gemini Draft ${model}] Error: ${(err as Error).message}`);
      }
    }
  }

  return generateFallbackDraft(firstName, params);
}

function generateFallbackDraft(firstName: string, params: DraftReplyParams): string {
  const greeting = firstName && firstName !== 'there' ? `Hey ${firstName},` : 'Hey there,';
  if (params.isAlternativeAngle) {
    return `${greeting}\n\nI'd be glad to walk through this with you. Would Thursday at 2 PM or Friday at 11 AM EST work for a quick 10-minute call?\n\nBest,\nMevin`;
  }
  return `${greeting}\n\nThanks for reaching out. Would Thursday at 2 PM or Friday at 11 AM EST work for a quick 10-minute chat to go over the details?\n\nBest,\nMevin`;
}

function isValidSentiment(val: unknown): val is ReplySentiment {
  return (
    val === 'POSITIVE_INTEREST' ||
    val === 'OBJECTION_OR_QUESTION' ||
    val === 'NEUTRAL_AUTO_REPLY' ||
    val === 'NEGATIVE_OPT_OUT'
  );
}

function ruleBasedClassification(text: string): ClassificationResult {
  const lower = text.toLowerCase();
  if (
    lower.includes('unsubscribe') ||
    lower.includes('stop') ||
    lower.includes('remove me') ||
    lower.includes('not interested') ||
    lower.includes("don't email")
  ) {
    return { sentiment: 'NEGATIVE_OPT_OUT', explanation: 'Detected opt-out / unsubscribe keywords' };
  }

  if (
    lower.includes('out of office') ||
    lower.includes('auto-reply') ||
    lower.includes('automated response') ||
    lower.includes('on vacation')
  ) {
    return { sentiment: 'NEUTRAL_AUTO_REPLY', explanation: 'Detected automated vacation responder' };
  }

  if (
    lower.includes('call') ||
    lower.includes('interested') ||
    lower.includes('demo') ||
    lower.includes('sample') ||
    lower.includes('what would it take') ||
    lower.includes('quote') ||
    lower.includes('rates') ||
    lower.includes('chat') ||
    lower.includes('meet') ||
    lower.includes("let's discuss")
  ) {
    return { sentiment: 'POSITIVE_INTEREST', explanation: 'Detected high-intent buying signals' };
  }

  return { sentiment: 'OBJECTION_OR_QUESTION', explanation: 'Classified as inbound inquiry or clarification' };
}
