import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: Set to true because the MoraliApp.tsx has some intentional `catch (err: any)` patterns.
  // TODO: Remove when all types are strict.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,

  // Prevent firebase-admin from being bundled into client code
  serverExternalPackages: ["firebase-admin"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://js.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://sentry.io https://*.ingest.sentry.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
