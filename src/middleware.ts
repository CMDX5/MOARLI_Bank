import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Security layer for all requests.
 *
 * SECURITY FEATURES:
 * 1. X-Request-Id: Unique identifier for every request (traceability)
 * 2. CSP Nonce: Cryptographic nonce generated per-request, passed to
 *    server components via request headers for script-src protection.
 *    This blocks script injection (XSS) while allowing React inline styles.
 * 3. Rate limiting: Lightweight in-memory IP-based check for sensitive
 *    unauthenticated endpoints (first line of defense). The primary
 *    per-user rate limiting is handled in each API route via
 *    src/lib/rate-limit.ts (Firestore-backed, persistent).
 *
 * EDGE RUNTIME COMPATIBLE:
 * - No Node.js APIs (fs, path, process.cwd) — only Web APIs
 * - No Firestore Admin SDK import (uses Node.js fs for credentials)
 * - Uses crypto.randomUUID() for nonce generation (Edge-compatible)
 */

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // requests per window per IP

const SENSITIVE_PATTERNS = ['/auth', '/pin', '/login', '/register', '/verify'];

// Lightweight in-memory rate limit store (Edge Runtime compatible)
// Note: This is a first line of defense only. On Vercel, each edge node
// has its own memory. The authoritative rate limiting happens in API routes
// via src/lib/rate-limit.ts which uses Firestore for persistence.
const ipCounters = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): { limited: boolean; remaining: number } {
  const now = Date.now();
  const entry = ipCounters.get(ip);

  if (!entry || entry.resetAt <= now) {
    ipCounters.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { limited: false, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { limited: true, remaining: 0 };
  }

  entry.count += 1;
  return { limited: false, remaining: RATE_LIMIT_MAX - entry.count };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Generate CSP nonce (Edge-compatible) ──
  const nonce = crypto.randomUUID();

  // ── 2. Build CSP header ──
  // script-src: nonce-based — blocks XSS via injected <script> tags
  // style-src: 'unsafe-inline' required for React's style={{}} syntax
  //            CSS exfiltration risk is accepted and mitigated by:
  //            - Input sanitization via Zod validation
  //            - No user-controlled HTML rendering (no dangerouslySetInnerHTML)
  //            - Content-Security-Policy-Report-Only for monitoring
  const cspValue = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://js.sentry-cdn.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://www.googleapis.com https://sentry.io https://*.ingest.sentry.io",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  // ── 3. Create response with security headers ──
  const response = NextResponse.next();

  // Set CSP on response (browser enforces this)
  response.headers.set('Content-Security-Policy', cspValue);

  // Additional security headers (OWASP recommendations)
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Pass nonce to server components via request headers
  // (server components read this via `headers()` from next/headers)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  // Add request ID for traceability
  response.headers.set('X-Request-Id', crypto.randomUUID());

  // ── 4. Rate limiting on sensitive unauthenticated endpoints ──
  if (pathname.startsWith('/api/')) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => pathname.includes(p));

    if (isSensitive) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

      const result = checkIpRateLimit(ip);

      if (result.limited) {
        return new NextResponse(
          JSON.stringify({ error: 'Trop de requêtes. Réessayez plus tard.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Content-Security-Policy': cspValue,
              'Retry-After': '60',
              'X-Request-Id': crypto.randomUUID(),
              'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }

      response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
      response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    }
  }

  // ── 5. Return response with modified request (carries nonce to layout) ──
  return NextResponse.next({
    request: { headers: requestHeaders },
    headers: response.headers,
  });
}

export const config = {
  // Match all routes except static assets and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
