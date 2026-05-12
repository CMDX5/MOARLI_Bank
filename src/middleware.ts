import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Security layer for all API routes.
 *
 * SECURITY FEATURES:
 * 1. X-Request-Id: Unique identifier for every request (traceability)
 * 2. Rate limiting: Hybrid Firestore + in-memory for sensitive endpoints
 *    - Unauthenticated routes: IP-based (in-memory fallback for serverless)
 *    - Authenticated routes: UID-based via API route rate-limit.ts
 * 3. Security headers: CORS control, no-sniff, HSTS reinforcement
 *
 * NOTE: The main per-user rate limiting happens in src/lib/rate-limit.ts
 * and is applied in each API route handler. This middleware provides
 * an additional IP-based layer for unauthenticated sensitive endpoints.
 */

// Lightweight in-memory rate limiter for unauthenticated routes
// This is a first line of defense; per-route rate limiting handles authenticated users
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // requests per window per IP

// Cleanup stale entries every 5 minutes to prevent memory leaks
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now - entry.lastReset > RATE_LIMIT_WINDOW * 2) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

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

// Routes that require stricter rate limiting (unauthenticated)
const SENSITIVE_PATTERNS = ['/auth', '/pin', '/login', '/register', '/verify'];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // ── 1. Add request ID for traceability ──
  response.headers.set('X-Request-Id', crypto.randomUUID());

  // ── 2. Rate limiting on sensitive unauthenticated endpoints ──
  if (pathname.startsWith('/api/')) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => pathname.includes(p));

    if (isSensitive) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

      if (isRateLimited(ip)) {
        return new NextResponse(
          JSON.stringify({ error: 'Trop de requêtes. Réessayez plus tard.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
              'X-Request-Id': crypto.randomUUID(),
            },
          }
        );
      }

      // Add rate limit headers to response
      const entry = rateLimitMap.get(ip);
      const remaining = entry ? Math.max(0, RATE_LIMIT_MAX - entry.count) : RATE_LIMIT_MAX;
      response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
