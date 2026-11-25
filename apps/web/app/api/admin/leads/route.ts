import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const search = searchParams.get('search');
  const emailStatus = searchParams.get('emailStatus');

  try {
    const where: any = {};
    if (platform && platform !== 'all') {
      where.platform = platform;
    }
    if (emailStatus === 'sent') {
      where.OR = [
        { messageIdHeader: { not: null } },
        { status: { in: ['SENT', 'REPLIED', 'IN_CONVERSATION', 'CONVERTED'] } },
      ];
    } else if (emailStatus === 'not_sent') {
      where.contactEmailOrHandle = { contains: '@' };
      where.messageIdHeader = null;
      where.status = { notIn: ['SENT', 'REPLIED', 'IN_CONVERSATION', 'CONVERTED'] };
    }
    if (search) {
      where.AND = [
        ...(where.OR ? [{ OR: where.OR }] : []),
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { contactEmailOrHandle: { contains: search, mode: 'insensitive' } },
            { auditSummary: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
      delete where.OR;
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { winProbability: 'desc' },
      include: {
        messageThreads: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('[Admin Leads API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch leads.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { leadId, status, winProbability } = await req.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required.' }, { status: 400 });
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(status && { status }),
        ...(typeof winProbability === 'number' && { winProbability }),
      },
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error('[Admin Update Lead Error]:', error);
    return NextResponse.json({ error: 'Failed to update lead.' }, { status: 500 });
  }
}
