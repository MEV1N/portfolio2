import { NextRequest, NextResponse } from 'next/server';
import { verifyTimingSafe, createSessionToken, ADMIN_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    const adminSecret = process.env.ADMIN_SECRET || 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c';

    if (!verifyTimingSafe(secret || '', adminSecret)) {
      return NextResponse.json(
        { error: 'Invalid admin secret key.' },
        { status: 401 }
      );
    }

    const token = createSessionToken();
    const res = NextResponse.json({ success: true, message: 'Authentication successful.' });

    // Set HTTP-only secure cookie
    res.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Login error.' }, { status: 500 });
  }
}
