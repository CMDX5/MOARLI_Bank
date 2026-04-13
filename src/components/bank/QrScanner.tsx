'use client';
import React, { type RefObject } from "react";

interface QrScannerProps {
  open: boolean;
  status: "idle" | "scanning" | "found" | "error";
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
  onRetry: () => void;
}

export default function QrScanner({ open, status, videoRef, canvasRef, onClose, onRetry }: QrScannerProps) {
  if (!open) return null;

  return (
    <div className="card-modal-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
        <div className="bc-head">
          <div className="bc-head-left">
            <div className="bc-kicker">Transfert</div>
            <div className="bc-title">Scanner QR</div>
            <div className="bc-subtitle">Scannez un QR code Morali pour initier un transfert.</div>
          </div>
          <button className="bc-close" onClick={onClose} aria-label="Fermer">&times;</button>
        </div>
        <div className="camera-modal-stage">
          <div className="camera-viewfinder" style={{ position: "relative", overflow: "hidden" }}>
            {/* Video + Canvas ALWAYS rendered so refs are always available */}
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 32, position: "absolute", inset: 0, zIndex: 1 }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Loading overlay (idle) */}
            {status === "idle" && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "radial-gradient(circle at 30% 30%, rgba(59,130,246,0.12), transparent 50%), #0a1224", borderRadius: 32 }}>
                <div className="camera-corner tl" />
                <div className="camera-corner tr" />
                <div className="camera-corner bl" />
                <div className="camera-corner br" />
                <div className="camera-scan-line" />
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "var(--blue)", animation: "spin 1s linear infinite" }} />
                <div className="camera-helper">Activation de la caméra en cours...</div>
              </div>
            )}

            {/* Scanning overlay */}
            {status === "scanning" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
                <div style={{ width: "70%", height: "70%", border: "2px solid rgba(212,164,55,0.5)", borderRadius: 16, boxShadow: "0 0 30px rgba(212,164,55,0.2)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: "20%", width: "60%", height: 2, background: "var(--gold)", boxShadow: "0 0 12px var(--gold)", animation: "scanPulse 2.5s ease-in-out infinite" }} />
                </div>
              </div>
            )}

            {/* Found overlay */}
            {status === "found" && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(5,11,26,0.85)", borderRadius: 32 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>QR code détecté !</span>
                <span style={{ fontSize: 11, color: "var(--dim)", maxWidth: "70%", textAlign: "center", lineHeight: 1.4 }}>Ouverture du transfert en cours...</span>
              </div>
            )}

            {/* Error overlay */}
            {status === "error" && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(5,11,26,0.9)", borderRadius: 32 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>Caméra non disponible</span>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>Vérifiez les permissions de votre navigateur</span>
                <button onClick={onRetry} style={{ marginTop: 8, padding: "10px 24px", borderRadius: 14, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Réessayer</button>
              </div>
            )}
          </div>
          <div className="security-summary">
            <div className="security-stat">
              <div className="security-stat-kicker">Mode</div>
              <div className="security-stat-value" style={{ color: status === "scanning" ? "var(--gold)" : status === "found" ? "#4ade80" : "#fff" }}>{status === "idle" ? "En attente" : status === "scanning" ? "Scan actif" : status === "found" ? "Détecté ✓" : "Erreur"}</div>
            </div>
            <div className="security-stat">
              <div className="security-stat-kicker">Statut</div>
              <div className="security-stat-value" style={{ color: status === "scanning" ? "#4ade80" : "#fff" }}>{status === "idle" ? "Caméra inactive" : status === "scanning" ? "Caméra active" : status === "found" ? "Connexion..." : "Indisponible"}</div>
            </div>
          </div>
          <div className="camera-actions">
            <button className="bc-btn-full" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
