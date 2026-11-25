import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';
import { draftContextualReply } from '@/lib/gemini';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { leadId } = await params;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { messageThreads: { orderBy: { createdAt: 'asc' } } },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const threads = lead.messageThreads || [];
    const totalPortfolioClicks = threads.reduce((sum, t) => sum + (t.portfolioClicks || 0), 0);

    // Re-prompt Gemini for alternative punchier angle
    const newDraft = await draftContextualReply({
      leadName: lead.name,
      matchedService: lead.matchedService,
      auditSummary: lead.auditSummary,
      portfolioClicks: totalPortfolioClicks,
      threadHistory: threads.map((t) => ({ direction: t.direction, content: t.content })),
      isAlternativeAngle: true,
    });

    // Update lead draftReply
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        draftReply: newDraft,
        draftStatus: 'PENDING_REVIEW',
        updatedAt: new Date(),
      },
    });

    console.log(`[Regenerate Draft] Updated draftReply for lead ${lead.name} (${lead.id})`);

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      draftReply: newDraft,
      draftStatus: updated.draftStatus,
    });
  } catch (error: unknown) {
    console.error('[Regenerate Draft Error]:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate draft.' },
      { status: 500 }
    );
  }
}
