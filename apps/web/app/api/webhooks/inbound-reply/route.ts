import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { verifyBearerToken } from '@/lib/auth';
import { classifyInboundReply, draftContextualReply, extractCleanReplyBody } from '@/lib/gemini';
import { sendTelegramLeadDossier } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  // 1. Authenticate webhook caller via timing-safe Bearer token
  const authHeader = req.headers.get('Authorization');
  if (!verifyBearerToken(authHeader)) {
    console.warn('[Inbound Webhook] Unauthorized request attempt.');
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing ADMIN_SECRET bearer token.' },
      { status: 401 }
    );
  }

  try {
    const payload = await req.json();
    const { leadId, replyText, inReplyTo, messageId } = payload;
    const senderEmail = payload.senderEmail || payload.fromEmail;

    if (!replyText || typeof replyText !== 'string') {
      return NextResponse.json(
        { error: 'Bad Request: replyText is required.' },
        { status: 400 }
      );
    }

    // 2. Locate matching prospect in database
    let lead = null;
    if (leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { messageThreads: { orderBy: { createdAt: 'asc' } } },
      });
    }

    if (!lead && senderEmail) {
      lead = await prisma.lead.findFirst({
        where: {
          contactEmailOrHandle: {
            contains: senderEmail,
            mode: 'insensitive',
          },
        },
        include: { messageThreads: { orderBy: { createdAt: 'asc' } } },
      });
    }

    if (!lead && inReplyTo) {
      lead = await prisma.lead.findFirst({
        where: {
          messageIdHeader: inReplyTo,
        },
        include: { messageThreads: { orderBy: { createdAt: 'asc' } } },
      });
    }

    if (!lead) {
      // If a real human emailed Mevin, auto-create a lead so Mevin gets alerted in Telegram!
      if (senderEmail && !/no-?reply|mailer-daemon|postmaster|google\.com/i.test(senderEmail)) {
        console.log(`[Inbound Webhook] Auto-capturing direct inbound prospect from ${senderEmail}...`);
        const prospectName = payload.senderName || senderEmail.split('@')[0] || 'Inbound Prospect';
        lead = await prisma.lead.create({
          data: {
            name: prospectName,
            platform: 'email',
            contactEmailOrHandle: senderEmail,
            sourceUrl: 'https://mail.google.com',
            status: 'REPLIED',
            fitScore: 8,
            winProbability: 50,
            auditSummary: `Direct inbound email inquiry: ${replyText.slice(0, 150)}`,
            matchedService: 'web',
            ...(messageId && { messageIdHeader: messageId }),
          },
          include: { messageThreads: { orderBy: { createdAt: 'asc' } } },
        });
      } else {
        console.warn(`[Inbound Webhook] No matching prospect found for sender: ${senderEmail || leadId}`);
        return NextResponse.json(
          { error: 'Lead not found for provided identifiers.' },
          { status: 404 }
        );
      }
    }

    // 3. Classify reply sentiment via Gemini
    const { sentiment, explanation } = await classifyInboundReply(replyText);

    // 4. Update Win Probability & Status
    let newWinProbability = lead.winProbability;
    let newStatus = lead.status;

    if (sentiment === 'POSITIVE_INTEREST') {
      newWinProbability = Math.min(100, lead.winProbability + 35);
      newStatus = 'CONVERTED';
    } else if (sentiment === 'OBJECTION_OR_QUESTION') {
      newWinProbability = Math.min(100, lead.winProbability + 15);
      newStatus = 'REPLIED';
    } else if (sentiment === 'NEGATIVE_OPT_OUT') {
      newWinProbability = 0;
      newStatus = 'OPTED_OUT';
    } else {
      newStatus = 'REPLIED';
    }

    // Calculate portfolio clicks and outbound hook context
    const existingThreads = lead.messageThreads || [];
    const totalPortfolioClicks = existingThreads.reduce((sum, t) => sum + (t.portfolioClicks || 0), 0);
    const outboundHook = existingThreads.find((t) => t.direction === 'OUTBOUND')?.content || null;

    let draftReply: string | null = null;
    let draftStatus: string | null = null;
    let telegramMessageId: number | null = null;

    const cleanInboundText = extractCleanReplyBody(replyText);

    // 5. If warm reply (POSITIVE_INTEREST or OBJECTION_OR_QUESTION), draft reply and send rich dossier
    if (sentiment === 'POSITIVE_INTEREST' || sentiment === 'OBJECTION_OR_QUESTION') {
      draftReply = await draftContextualReply({
        leadName: lead.name,
        matchedService: lead.matchedService,
        auditSummary: lead.auditSummary,
        portfolioClicks: totalPortfolioClicks,
        threadHistory: [
          ...existingThreads.map((t) => ({ direction: t.direction, content: t.content })),
          { direction: 'INBOUND', content: cleanInboundText },
        ],
      });
      draftStatus = 'PENDING_REVIEW';

      // Send Rich Telegram Dossier with 2x2 inline action keyboard
      telegramMessageId = await sendTelegramLeadDossier({
        leadId: lead.id,
        prospectName: lead.name,
        platform: lead.platform,
        sourceUrl: lead.sourceUrl,
        matchedService: lead.matchedService,
        fitScore: lead.fitScore,
        portfolioClicks: totalPortfolioClicks,
        winProbability: newWinProbability,
        auditSummary: lead.auditSummary,
        outboundHook,
        incomingReply: cleanInboundText,
        proposedReply: draftReply,
      });
    }

    // 6. Atomically update Lead and create Inbound MessageThread
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          winProbability: newWinProbability,
          status: newStatus,
          nextFollowUpAt: null, // Cancel pending follow-ups
          draftReply,
          draftStatus,
          ...(telegramMessageId && { telegramMessageId }),
          updatedAt: new Date(),
        },
      });

      await tx.messageThread.create({
        data: {
          leadId: lead.id,
          direction: 'INBOUND',
          content: cleanInboundText,
          sentiment,
          portfolioClicks: 0,
        },
      });
    });

    console.log(
      `[Inbound Webhook Processed] Prospect: ${lead.name} | Sentiment: ${sentiment} | WinProb: ${lead.winProbability}% -> ${newWinProbability}% | Draft: ${!!draftReply}`
    );

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      sentiment,
      explanation,
      updatedWinProbability: newWinProbability,
      status: newStatus,
      draftReply,
      draftStatus,
      telegramMessageId,
    });
  } catch (error: unknown) {
    console.error('[Inbound Webhook Error]:', error);
    return NextResponse.json(
      { error: 'Internal server error processing inbound reply.' },
      { status: 500 }
    );
  }
}
