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
    return NextResponse.json({ isPaused: !pipelineActive, pipelineActive });
  } catch (error) {
    console.error('[Admin Engine GET Error]:', error);
    return NextResponse.json({ error: 'Failed to read outreach engine status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let isPaused: boolean;

    if (typeof body.isPaused === 'boolean') {
      isPaused = body.isPaused;
    } else if (typeof body.active === 'boolean') {
      isPaused = !body.active;
    } else if (typeof body.pipelineActive === 'boolean') {
      isPaused = !body.pipelineActive;
    } else {
      const current = await prisma.systemConfig.findUnique({
        where: { key: 'pipelineActive' },
      });
      isPaused = current?.value === 'true';
    }

    const pipelineActive = !isPaused;

    await prisma.systemConfig.upsert({
      where: { key: 'pipelineActive' },
      update: { value: String(pipelineActive) },
      create: { key: 'pipelineActive', value: String(pipelineActive) },
    });

    await prisma.systemConfig.upsert({
      where: { key: 'outreachPaused' },
      update: { value: String(isPaused) },
      create: { key: 'outreachPaused', value: String(isPaused) },
    });

    return NextResponse.json({ success: true, isPaused, pipelineActive });
  } catch (error) {
    console.error('[Admin Engine POST Error]:', error);
    return NextResponse.json({ error: 'Failed to update outreach engine status.' }, { status: 500 });
  }
}
