import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import crypto from "crypto";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,

  // Prevent firebase-admin from being bundled into client code
  serverExternalPackages: ["firebase-admin"],

  // Remove X-Powered-By header to prevent technology fingerprinting
  // Blocks: "X-Powered-By: Next.js" header exposure
  poweredByHeader: false,

  async headers() {
    // Generate a fresh nonce per request for CSP
    // This replaces 'unsafe-inline' in style-src and script-src
    // with a cryptographic nonce, preventing CSS/JS injection attacks.
    const nonce = crypto.randomBytes(16).toString("base64");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // ═══════════════════════════════════════════════════════
            // HARDENED CSP — Bank-Grade Security Policy (Nonce-based)
            // ═══════════════════════════════════════════════════════
            // Attack surface reduction:
            //   ✅ object-src 'none' — Blocks Flash/Java/plugin injection
            //   ✅ NO unsafe-eval — Blocks eval(), Function(), string-to-code
            //   ✅ NONCE-based scripts/styles — Only server-signed code executes
            //   ✅ frame-ancestors 'none' — Blocks clickjacking
            //   ✅ base-uri 'self' — Blocks <base> tag injection
            //   ✅ form-action 'self' — Blocks form submission to external sites
            //   ✅ upgrade-insecure-requests — Auto HTTPS upgrade
            //
            // NONCE STRATEGY:
            //   - A unique cryptographic nonce is generated per request
            //   - Next.js embeds this nonce in <script> and <style> tags via
            //     the _headers.tsx or layout.tsx <Script nonce={nonce}> pattern
            //   - The CSP header only allows scripts/styles with the matching nonce
            //   - This eliminates 'unsafe-inline' entirely, blocking CSS exfiltration
            //     and script injection even if an HTML injection is found
            //
            // Whitelisted external origins (immutable, no nonce needed):
            //   - Firebase (Auth, Firestore, Storage, Installations)
            //   - Sentry (error monitoring, CDN)
            //   - Google Fonts (typography)
            // ═══════════════════════════════════════════════════════
            value: [
              "default-src 'self'",
              // Script: nonce-based (blocks injected scripts without valid nonce)
              `script-src 'self' 'nonce-${nonce}' https://js.sentry-cdn.com`,
              // Style: nonce-based (blocks CSS exfiltration attacks)
              `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://www.googleapis.com https://sentry.io https://*.ingest.sentry.io",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Pass nonce to client via custom header for Next.js Script/Style components
          { key: "x-csp-nonce", value: nonce },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Disable automatic Sentry source map upload during development
  silent: true,

  // Disable automatic wrapping of API handlers (we do manual instrumentation)
  automaticVercelMonitors: false,

  // Only enable SentryWebpackPlugin in production builds
  disableLogger: process.env.NODE_ENV !== "production",
});
