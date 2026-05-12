import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter for sensitive API endpoints
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Add request ID for traceability
  response.headers.set('X-Request-Id', crypto.randomUUID());

  // Rate limiting on sensitive endpoints
  if (
    pathname.startsWith('/api/') &&
    (pathname.includes('/auth') ||
      pathname.includes('/pin') ||
      pathname.includes('/login') ||
      pathname.includes('/register'))
  ) {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return new NextResponse(
        JSON.stringify({ error: 'Trop de requêtes. Réessayez plus tard.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
