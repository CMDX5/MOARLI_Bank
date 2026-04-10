import type { Metadata, Viewport } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Sentry: inject client-side monitoring script */}
        {process.env.NEXT_PUBLIC_SENTRY_DSN && (
          <script
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
