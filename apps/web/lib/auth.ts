import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'admin_auth_token';

function getAdminSecret(): string {
  return process.env.ADMIN_SECRET || 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c';
}

/**
 * Timing-safe string comparison to prevent timing attacks on bearer tokens
 */
export function verifyTimingSafe(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    // Constant time dummy check
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Verifies Bearer token in Authorization header
 */
export function verifyBearerToken(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const secret = getAdminSecret();
  return verifyTimingSafe(token, secret);
}

/**
 * Creates session token from admin secret
 */
export function createSessionToken(): string {
  const secret = getAdminSecret();
  return crypto.createHmac('sha256', secret).update('admin_authenticated_session').digest('hex');
}

/**
 * Verifies cookie auth in Next.js Server Components or Route Handlers
 */
export async function isAuthenticatedAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = createSessionToken();
  return verifyTimingSafe(token, expected);
}

export { ADMIN_COOKIE_NAME };
