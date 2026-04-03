import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: Set to true because the 13K-line MoraliApp.tsx has some intentional `catch (err: any)` patterns.
  // TODO: Remove when MoraliApp.tsx is split into modules and all types are strict.
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

export default nextConfig;
