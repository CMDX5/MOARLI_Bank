import type { NextConfig } from "next";

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
    return [
      {
        // All routes — global security headers
        source: "/(.*)",
        headers: [
          // NOTE: Content-Security-Policy is handled by middleware (per-request nonce)
          // to enable nonce-based script-src while supporting React inline styles.
          // See src/middleware.ts for the full CSP configuration.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // SECURITY: Prevent clickjacking — deny all iframe embedding.
          { key: "X-Frame-Options", value: "DENY" },
          // SECURITY: Enable XSS protection in legacy browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // SECURITY: Prevent browsers from prefetching DNS, connecting, or preloading to untrusted domains
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // QR scanner page — camera access is required here only
        source: "/scan",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        // All other pages — camera disabled (principle of least privilege)
        source: "/((?!scan).*)",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;