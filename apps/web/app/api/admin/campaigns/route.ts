import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[Admin Campaigns API Error]:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { campaignId, active, keywords, platform } = await req.json();

    if (campaignId) {
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...(typeof active === 'boolean' && { active }),
          ...(keywords && { keywords }),
        },
      });
      return NextResponse.json({ success: true, campaign: updated });
    }

    if (!platform || !keywords) {
      return NextResponse.json({ error: 'platform and keywords are required.' }, { status: 400 });
    }

    const created = await prisma.campaign.create({
      data: {
        platform,
        keywords,
        active: true,
      },
    });

    return NextResponse.json({ success: true, campaign: created });
  } catch (error) {
    console.error('[Admin Create/Toggle Campaign Error]:', error);
    return NextResponse.json({ error: 'Failed to save campaign.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 });
    }

    await prisma.campaign.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[Admin Delete Campaign Error]:', error);
    return NextResponse.json({ error: 'Failed to delete campaign.' }, { status: 500 });
  }
}
