'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AppIcon, MoraliShield } from "@/components/bank/Icons";
import { maskCardNumber } from "@/lib/helpers";
import { IconName } from "@/types/morali";

export interface CardAction {
  icon: IconName;
  label: string;
  sub: string;
}

export interface CardsViewProps {
  cardLocked: boolean;
  cardTransform: string;
  onCardMove: (clientX: number, clientY: number, rect: DOMRect) => void;
  onCardLeave: () => void;
  cardNumber: string;
  cardCcv: string;
  cardExp: string;
  holder: string;
  blackCardNumber: string;
  blackCardCcv: string;
  blackCardExp: string;
  onBlackCardClick: () => void;
  cardActions: CardAction[];
  onCardAction: (label: string) => void;
  showToast: (msg: string) => void;
}

/* ─── constants ─── */
const REVEAL_COUNTDOWN = 15; // seconds
const MOCK_SPENDING = { spent: 124_800, limit: 500_000 };

/* ─── reusable reveal hook ─── */
function useRevealWithTimer() {
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState(REVEAL_COUNTDOWN);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    setRevealed(false);
    setCountdown(REVEAL_COUNTDOWN);
    stopTimer();
  }, [stopTimer]);

  const reveal = useCallback(() => {
    setRevealed(true);
    setCountdown(REVEAL_COUNTDOWN);
    stopTimer();
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopTimer();
          setRevealed(false);
          return REVEAL_COUNTDOWN;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // Cleanup on unmount
  useEffect(() => stopTimer, [stopTimer]);

  return { revealed, countdown, reveal, hide };
}

/* ─── main component ─── */
export default function CardsView({
  cardLocked,
  cardTransform,
  onCardMove,
  onCardLeave,
  cardNumber,
  cardCcv,
  cardExp,
  holder,
  blackCardNumber,
  blackCardCcv,
  blackCardExp,
  onBlackCardClick,
  cardActions,
  onCardAction,
  showToast,
}: CardsViewProps) {
  const essential = useRevealWithTimer();
  const black = useRevealWithTimer();

  // Copy feedback states
  const [copiedEssential, setCopiedEssential] = useState(false);
  const [copiedBlack, setCopiedBlack] = useState(false);

  // Spending progress (internal mock data)
  const spendPercent = Math.min((MOCK_SPENDING.spent / MOCK_SPENDING.limit) * 100, 100);
  const spendColor =
    spendPercent < 50
      ? "#34d399"
      : spendPercent < 80
        ? "#fbbf24"
        : "#f43f5e";
  const spendGradientFrom =
    spendPercent < 50
      ? "rgba(52,211,153,0.25)"
      : spendPercent < 80
        ? "rgba(251,191,36,0.25)"
        : "rgba(244,63,94,0.25)";

  const handleCopy = useCallback(
    (number: string, which: "essential" | "black") => {
      navigator.clipboard.writeText(number).then(() => {
        if (which === "essential") {
          setCopiedEssential(true);
          setTimeout(() => setCopiedEssential(false), 1800);
        } else {
          setCopiedBlack(true);
          setTimeout(() => setCopiedBlack(false), 1800);
        }
      });
    },
    []
  );

  return (
    <div className="app-screen active">
      <style>{`
        /* ── Elite: Active badge glow ── */
        @keyframes eliteActiveGlow {
          0%, 100% { box-shadow: 0 0 4px rgba(34,197,94,0.3); }
          50%      { box-shadow: 0 0 12px rgba(34,197,94,0.6), 0 0 24px rgba(34,197,94,0.15); }
        }
        .badge-actif-glow {
          animation: eliteActiveGlow 2.2s ease-in-out infinite;
        }

        /* ── Elite: Premium badge shimmer ── */
        @keyframes elitePremiumShimmer {
          0%   { background-position: -120% center; }
          100% { background-position: 120% center; }
        }
        .badge-premium-shimmer {
          background-image: linear-gradient(
            90deg,
            rgba(212,164,55,0.18) 0%,
            rgba(255,223,120,0.38) 40%,
            rgba(212,164,55,0.18) 80%
          );
          background-size: 200% 100%;
          animation: elitePremiumShimmer 2.8s linear infinite;
        }

        /* ── Elite: Lock overlay pulse ── */
        @keyframes eliteLockPulse {
          0%, 100% { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0.72; }
          50%      { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); opacity: 0.88; }
        }
        .card-lock-overlay {
          animation: eliteLockPulse 2.6s ease-in-out infinite;
        }

        /* ── Elite: Countdown badge ── */
        @keyframes eliteCountdownFadeIn {
          from { opacity: 0; transform: translateY(4px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .countdown-badge {
          animation: eliteCountdownFadeIn 0.3s ease-out forwards;
        }
      `}</style>

      <div className="content-scrollable nav-safe">
        <div className="cards-screen">
          <div className="tab-title">Mes Cartes</div>

          <div className="cards-duo" style={{ gap: 14 }}>
            {/* ── CARTE STANDARD : Morali Essentielle ── */}
            <div className="cards-duo-card">
              <div className="cards-duo-tag essentielle">
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                Morali Essentielle
                <div
                  className="badge-actif-glow"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#4ade80",
                    background: "rgba(34,197,94,0.15)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  ACTIF
                </div>
              </div>
              <div className="card-tilt-wrap">
                <div
                  className={`virtual-card ${cardLocked ? "locked" : ""}`}
                  style={{ transform: cardTransform, position: "relative" }}
                  onMouseMove={(e) => onCardMove(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={onCardLeave}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    onCardMove(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect());
                  }}
                  onTouchEnd={onCardLeave}
                  onClick={() => showToast(cardLocked ? "Carte verrouillée" : "Carte virtuelle activée")}
                >
                  {/* Card decorative layers */}
                  <div className="vc-gold-line" />
                  <div className="vc-gold-line bottom" />
                  <div className="vc-left-glow" />
                  <div className="vc-right-glow" />
                  <div className="vc-orb1" />
                  <div className="vc-orb2" />
                  <div className="vc-micro-grid" />
                  <div className="vc-brush" />
                  <div className="vc-photo-gloss" />

                  <div className="vc-content">
                    <div className="vc-top-row">
                      <div className="vc-logo-row">
                        <MoraliShield small />
                        <div>
                          <div className="vc-brand-name">MORALI</div>
                          <div className="vc-brand-sub">PAY</div>
                        </div>
                      </div>
                      <div className="vc-top-right">
                        <div className="vc-network" aria-label="Visa">
                          <div className="vc-visa-badge"><span className="visa-v">V</span>ISA</div>
                        </div>
                      </div>
                    </div>

                    <div className="vc-chip-row">
                      <div className="vc-chip shimmer" />
                      <svg className="nfc-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 8a10 10 0 0 1 0 8" />
                        <path d="M8 6a14 14 0 0 1 0 12" />
                        <path d="M11 4a18 18 0 0 1 0 16" />
                      </svg>
                    </div>

                    {/* Card Number + Copy row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        position: "relative",
                        marginTop: 4,
                      }}
                    >
                      <div
                        className="vc-number"
                        style={{ cursor: "pointer", flex: 1, textAlign: "center" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cardLocked) {
                            showToast("Carte verrouillée");
                            return;
                          }
                          essential.revealed ? essential.hide() : essential.reveal();
                        }}
                      >
                        {essential.revealed ? cardNumber : maskCardNumber(cardNumber)}
                      </div>
                      {/* Copy button – only visible when revealed */}
                      {essential.revealed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(cardNumber, "essential");
                          }}
                          title="Copier le numéro"
                          style={{
                            flexShrink: 0,
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "1px solid rgba(96,165,250,0.3)",
                            background: "rgba(59,130,246,0.12)",
                            color: "#60a5fa",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all .2s",
                            padding: 0,
                          }}
                        >
                          {copiedEssential ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Countdown badge */}
                    {essential.revealed && (
                      <div
                        className="countdown-badge"
                        style={{
                          textAlign: "center",
                          marginTop: 2,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: "#fbbf24",
                            background: "rgba(251,191,36,0.1)",
                            border: "1px solid rgba(251,191,36,0.2)",
                            padding: "2px 10px",
                            borderRadius: 6,
                            letterSpacing: "0.05em",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          Masquage dans {essential.countdown}s
                        </span>
                      </div>
                    )}

                    <div className="vc-bottom-row">
                      <div className="vc-holder-wrap">
                        <div className="vc-holder-l">Titulaire</div>
                        <div className="vc-holder-n" title={holder}>{holder}</div>
                      </div>
                      <div className="vc-ccv-wrap">
                        <div className="vc-ccv-l">CCV</div>
                        <div className="vc-ccv-v">{essential.revealed ? cardCcv : "•••"}</div>
                      </div>
                      <div className="vc-exp-visa-wrap">
                        <div className="vc-exp-wrap">
                          <div className="vc-exp">
                            <div className="vc-exp-l">Expire</div>
                            <div className="vc-exp-v">{cardExp}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Lock overlay ── */}
                  {cardLocked && (
                    <div
                      className="card-lock-overlay"
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 10,
                        borderRadius: 18,
                        background: "rgba(7,13,30,0.55)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        cursor: "default",
                        pointerEvents: "auto",
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        border: "1px solid rgba(244,63,94,0.18)",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        showToast("Carte verrouillée — Déverrouillez-la dans les paramètres");
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        <circle cx="12" cy="16" r="1" fill="#f43f5e" stroke="none" />
                      </svg>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#f43f5e",
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          textShadow: "0 0 10px rgba(244,63,94,0.35)",
                        }}
                      >
                        Carte verrouillée
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Copied feedback below essential card */}
              {copiedEssential && (
                <div
                  style={{
                    textAlign: "center",
                    marginTop: 2,
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#34d399",
                    letterSpacing: "0.04em",
                  }}
                >
                  ✓ Numéro copié !
                </div>
              )}
            </div>

            {/* ── CARTE BLACK : Morali Black Brazzaville ── */}
            <div className="cards-duo-card">
              <div className="cards-duo-tag black-tag">
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                Morali Black
                <div
                  className="badge-premium-shimmer"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#D4A437",
                    background: "rgba(212,164,55,0.15)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  PREMIUM
                </div>
              </div>
              <div className="card-tilt-wrap">
                <div
                  className="virtual-card black-card"
                  style={{ position: "relative" }}
                  onClick={onBlackCardClick}
                >
                  <div className="vc-gold-line" />
                  <div className="vc-gold-line bottom" />
                  <div className="vc-left-glow" />
                  <div className="vc-right-glow" />
                  <div className="vc-orb1" />
                  <div className="vc-orb2" />
                  <div className="vc-micro-grid" />
                  <div className="vc-brush" />
                  <div className="vc-photo-gloss" />

                  <div className="vc-content">
                    <div className="vc-top-row">
                      <div className="vc-logo-row">
                        <MoraliShield small />
                        <div>
                          <div className="vc-brand-name">MORALI</div>
                          <div className="vc-brand-sub">PAY</div>
                        </div>
                      </div>
                      <div className="vc-top-right">
                        <div className="vc-network" aria-label="Visa">
                          <div className="vc-visa-badge"><span className="visa-v">V</span>ISA</div>
                        </div>
                      </div>
                    </div>

                    <div className="vc-chip-row">
                      <div className="vc-chip shimmer" />
                      <svg className="nfc-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 8a10 10 0 0 1 0 8" />
                        <path d="M8 6a14 14 0 0 1 0 12" />
                        <path d="M11 4a18 18 0 0 1 0 16" />
                      </svg>
                    </div>

                    {/* Card Number + Copy row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <div
                        className="vc-number"
                        style={{ cursor: "pointer", flex: 1, textAlign: "center" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          black.revealed ? black.hide() : black.reveal();
                        }}
                      >
                        {black.revealed ? blackCardNumber : maskCardNumber(blackCardNumber)}
                      </div>
                      {/* Copy button – only visible when revealed */}
                      {black.revealed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(blackCardNumber, "black");
                          }}
                          title="Copier le numéro"
                          style={{
                            flexShrink: 0,
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "1px solid rgba(212,164,55,0.3)",
                            background: "rgba(212,164,55,0.1)",
                            color: "#D4A437",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all .2s",
                            padding: 0,
                          }}
                        >
                          {copiedBlack ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Countdown badge */}
                    {black.revealed && (
                      <div
                        className="countdown-badge"
                        style={{
                          textAlign: "center",
                          marginTop: 2,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: "#D4A437",
                            background: "rgba(212,164,55,0.1)",
                            border: "1px solid rgba(212,164,55,0.2)",
                            padding: "2px 10px",
                            borderRadius: 6,
                            letterSpacing: "0.05em",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          Masquage dans {black.countdown}s
                        </span>
                      </div>
                    )}

                    <div className="vc-bottom-row">
                      <div className="vc-holder-wrap">
                        <div className="vc-holder-l">Titulaire</div>
                        <div className="vc-holder-n" title={holder}>{holder}</div>
                      </div>
                      <div className="vc-ccv-wrap">
                        <div className="vc-ccv-l">CCV</div>
                        <div className="vc-ccv-v">{black.revealed ? blackCardCcv : "•••"}</div>
                      </div>
                      <div className="vc-exp-visa-wrap">
                        <div className="vc-exp-wrap">
                          <div className="vc-exp">
                            <div className="vc-exp-l">Expire</div>
                            <div className="vc-exp-v">{blackCardExp}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Copied feedback below black card */}
              {copiedBlack && (
                <div
                  style={{
                    textAlign: "center",
                    marginTop: 2,
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#34d399",
                    letterSpacing: "0.04em",
                  }}
                >
                  ✓ Numéro copié !
                </div>
              )}
            </div>
          </div>

          {/* ── Card Spending Summary ── */}
          <div
            style={{
              marginTop: 6,
              padding: "16px 18px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {/* Title row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#64748b",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Dépenses ce mois
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: "#fff",
                  fontFamily: "'Montserrat', sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                {new Intl.NumberFormat("fr-FR").format(MOCK_SPENDING.spent)}{" "}
                <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>FCFA</span>
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${spendPercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${spendGradientFrom}, ${spendColor})`,
                  boxShadow: `0 0 8px ${spendColor}40`,
                  transition: "width .6s ease",
                }}
              />
            </div>

            {/* Limit row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#64748b",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Limite mensuelle
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#94a3b8",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {new Intl.NumberFormat("fr-FR").format(MOCK_SPENDING.limit)} FCFA
              </span>
            </div>

            {/* Percentage indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: spendColor,
                  boxShadow: `0 0 6px ${spendColor}50`,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: spendColor,
                }}
              >
                {spendPercent.toFixed(1)}% utilisé
              </span>
            </div>
          </div>

          <div className="card-actions-grid">
            {cardActions.map((item) => (
              <button
                key={item.label}
                className="card-action"
                onClick={() => onCardAction(item.label)}
              >
                <div className="tab-card-icon" style={{ background: "rgba(59,130,246,.1)", color: "#60a5fa" }}>
                  <AppIcon name={item.icon} size={18} stroke="#60a5fa" />
                </div>
                <div>
                  <div className="card-action-label">{item.label}</div>
                  <div className="card-action-sub">{item.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
