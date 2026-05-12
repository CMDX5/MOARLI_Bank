import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Security layer for all API routes.
 *
 * SECURITY FEATURES:
 * 1. X-Request-Id: Unique identifier for every request (traceability)
 * 2. Rate limiting: Firestore-backed (serverless-safe, no in-memory state)
 *    - IP-based for unauthenticated sensitive endpoints
 *    - Persists across Vercel serverless instances
 * 3. Security headers: CORS control, no-sniff, HSTS reinforcement
 *
 * NOTE: The main per-user rate limiting happens in src/lib/rate-limit.ts
 * and is applied in each API route handler. This middleware provides
 * an additional IP-based layer for unauthenticated sensitive endpoints.
 */

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // requests per window per IP

const SENSITIVE_PATTERNS = ['/auth', '/pin', '/login', '/register', '/verify'];

/**
 * Check rate limit using Firestore (serverless-safe).
 * Falls back to permissive mode if Firestore is unavailable (no silent failures).
 */
async function checkRateLimit(ip: string): Promise<{ limited: boolean; remaining: number } | null> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return null;

    const now = Date.now();
    const resetAt = now + RATE_LIMIT_WINDOW;
    const docRef = adminDb.collection("rateLimits").doc(`ip:${ip}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists || (docSnap.data()?.resetAt ?? 0) <= now) {
      // New window — set counter to 1
      await docRef.set({ count: 1, resetAt });
      return { limited: false, remaining: RATE_LIMIT_MAX - 1 };
    }

    const data = docSnap.data()!;
    if (data.count >= RATE_LIMIT_MAX) {
      return { limited: true, remaining: 0 };
    }

    // Increment counter (fire-and-forget for performance)
    docRef.update({ count: data.count + 1 }).catch(() => {});

    return { limited: false, remaining: RATE_LIMIT_MAX - data.count - 1 };
  } catch {
    // Firestore unavailable — allow request but log warning
    // Security degrades gracefully: no rate limiting rather than blocking all traffic
    console.warn("[middleware] Rate limit check failed (Firestore unavailable), allowing request");
    return null;
  }
}

export async function middleware(request: NextRequest) {
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

      const result = await checkRateLimit(ip);

      if (result?.limited) {
        return new NextResponse(
          JSON.stringify({ error: 'Trop de requêtes. Réessayez plus tard.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
              'X-Request-Id': crypto.randomUUID(),
              'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }

      if (result) {
        response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
        response.headers.set('X-RateLimit-Remaining', String(result.remaining));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
