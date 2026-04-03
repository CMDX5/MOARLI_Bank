"use client";
import { useEffect, useState, useRef } from "react";

export default function ClientWrapper() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Capture errors before MoraliApp loads
    const origError = console.error;
    const errors: string[] = [];
    console.error = (...args: unknown[]) => {
      const msg = args.map(a => {
        if (a instanceof Error) return a.message + "\n" + a.stack;
        if (typeof a === "object") try { return JSON.stringify(a); } catch { return String(a); }
        return String(a);
      }).join(" ");
      errors.push(msg);
      origError.apply(console, args);
    };

    import("./MoraliApp")
      .then((mod) => {
        // After import, check if React errors were logged
        const timer = setTimeout(() => {
          if (errors.length > 0) {
            console.warn("[DEBUG] Captured errors during MoraliApp load:", errors);
          }
        }, 2000);
        setApp(() => mod.default);
        return () => clearTimeout(timer);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message + "\n" + err.stack : String(err);
        setError(msg);
      });

    return () => {
      console.error = origError;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, background: "#1a1a2e", color: "#ff6b6b", fontFamily: "monospace", whiteSpace: "pre-wrap", fontSize: 12, minHeight: "100vh" }}>
        <h3 style={{ color: "#fff", marginBottom: 12 }}>Erreur de chargement MoraliApp</h3>
        {error}
      </div>
    );
  }

  return (
    <div id="app-root" style={{ minHeight: "100vh", background: "#050b1a" }}>
      {App ? <App /> : (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#94a3b8",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 14,
        }}>
          Chargement...
        </div>
      )}
    </div>
  );
}
