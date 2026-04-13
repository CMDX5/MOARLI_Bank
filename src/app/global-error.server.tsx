"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Server-side error page — replaces the default Next.js error page
export default function ServerErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{
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
          <svg width="32" height="38" viewBox="0 0 40 46" fill="none">
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
        }}>
          Erreur serveur
        </h2>

        <p style={{
          color: "#94a3b8",
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          Une erreur est survenue lors du traitement de votre requête.
        </p>

        <button
          onClick={reset}
          style={{
            padding: "14px 32px",
            background: "#3b82f6",
            border: "none",
            borderRadius: 14,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
