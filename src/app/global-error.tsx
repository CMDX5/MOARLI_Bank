"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Global error boundary — catches unhandled errors in the app
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Capture the error in Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{
        margin: 0,
        padding: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050b1a",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{
          textAlign: "center",
          maxWidth: 380,
          padding: 32,
        }}>
          {/* Shield Icon */}
          <div style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "rgba(212,164,55,0.1)",
            border: "1px solid rgba(212,164,55,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <svg width="32" height="38" viewBox="0 0 40 46" fill="none" aria-hidden="true">
              <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" fill="#1A3E78" />
              <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" stroke="#D4A437" strokeWidth="2" fill="none" />
              <path d="M14 18L18 22L26 14" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>

          <h2 style={{
            color: "#fff",
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 12,
            letterSpacing: "-0.3px",
            fontFamily: "'Montserrat', sans-serif",
          }}>
            Erreur inattendue
          </h2>

          <p style={{
            color: "#94a3b8",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 8,
          }}>
            Une erreur technique est survenue. Notre équipe a été notifiée automatiquement.
          </p>

          {error.digest && (
            <p style={{
              color: "#64748b",
              fontSize: 11,
              fontFamily: "monospace",
              marginBottom: 24,
            }}>
              Réf: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              border: "none",
              borderRadius: 14,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(59,130,246,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
