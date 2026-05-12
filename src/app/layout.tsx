import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Morali — Votre espace financier digital",
  description: "Morali - Plateforme de paiement et services financiers digitaux",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the CSP nonce generated per-request in middleware
  // Middleware passes it via request headers: NextResponse.next({ request: { headers } })
  const headersList = await headers();
  const nonce = headersList.get("x-csp-nonce") || "";

  return (
    <html lang="fr" suppressHydrationWarning nonce={nonce}>
      <head>
        {/* Sentry: inject client-side monitoring script */}
        {process.env.NEXT_PUBLIC_SENTRY_DSN && (
          <script
            nonce={nonce}
            src="https://js.sentry-cdn.com/10.48.0/bundle.min.js"
            crossOrigin="anonymous"
            data-lazy="true"
          />
        )}
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
