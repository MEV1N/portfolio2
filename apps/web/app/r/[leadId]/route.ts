import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;

  if (!leadId) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  try {
    // Atomically find, increment clicks, and boost win probability inside transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: {
          OR: [
            { id: leadId },
            { contactEmailOrHandle: { contains: leadId } },
          ],
        },
        include: {
          messageThreads: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!lead) return null;

      const updatedWinProbability = Math.min(99, lead.winProbability + 15);

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          winProbability: updatedWinProbability,
        },
      });

      if (lead.messageThreads.length > 0) {
        await tx.messageThread.update({
          where: { id: lead.messageThreads[0].id },
          data: {
            portfolioClicks: { increment: 1 },
          },
        });
      } else {
        await tx.messageThread.create({
          data: {
            leadId: lead.id,
            direction: 'INBOUND',
            content: '[Lead clicked portfolio link via outreach message]',
            sentiment: 'POSITIVE_INTEREST',
            portfolioClicks: 1,
          },
        });
      }

      return { lead, updatedWinProbability };
    });

    if (!result) {
      console.warn(`[Click Tracker] Lead not found for id: ${leadId}, redirecting to home.`);
      return NextResponse.redirect(new URL('/', req.url));
    }

    const { lead, updatedWinProbability } = result;

    console.log(
      `[Click Tracker] Lead ${lead.name} (${lead.id}) clicked portfolio. Win probability atomically boosted to ${updatedWinProbability}%.`
    );

    // Redirect to matched service route
    let destination = '/work/web';
    if (lead.matchedService === 'video') {
      destination = '/work/video';
    } else if (lead.matchedService === 'design') {
      destination = '/work/design';
    }

    return NextResponse.redirect(new URL(destination, req.url));
  } catch (error) {
    console.error('[Click Tracker Error]:', error);
    return NextResponse.redirect(new URL('/', req.url));
  }
}
