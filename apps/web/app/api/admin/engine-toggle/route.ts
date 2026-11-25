import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'pipelineActive' },
    });
    const pipelineActive = config?.value === 'true';
    return NextResponse.json({ pipelineActive, isPaused: !pipelineActive });
  } catch (error) {
    console.error('[Admin Engine-Toggle GET Error]:', error);
    return NextResponse.json({ error: 'Failed to read engine status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let nextActive: boolean;

    if (typeof body.active === 'boolean') {
      nextActive = body.active;
    } else if (typeof body.pipelineActive === 'boolean') {
      nextActive = body.pipelineActive;
    } else if (typeof body.isPaused === 'boolean') {
      nextActive = !body.isPaused;
    } else {
      const current = await prisma.systemConfig.findUnique({
        where: { key: 'pipelineActive' },
      });
      nextActive = current?.value !== 'true';
    }

    await prisma.systemConfig.upsert({
      where: { key: 'pipelineActive' },
      update: { value: String(nextActive) },
      create: { key: 'pipelineActive', value: String(nextActive) },
    });

    await prisma.systemConfig.upsert({
      where: { key: 'outreachPaused' },
      update: { value: String(!nextActive) },
      create: { key: 'outreachPaused', value: String(!nextActive) },
    });

    return NextResponse.json({
      success: true,
      pipelineActive: nextActive,
      isPaused: !nextActive,
    });
  } catch (error) {
    console.error('[Admin Engine-Toggle POST Error]:', error);
    return NextResponse.json({ error: 'Failed to update engine status.' }, { status: 500 });
  }
}
