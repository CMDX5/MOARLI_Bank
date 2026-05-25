'use client';

import React, { useState } from "react";
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
  onHistoryClick: () => void;
  cardActions: CardAction[];
  onCardAction: (label: string) => void;
  showToast: (msg: string) => void;
}

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
  onHistoryClick,
  cardActions,
  onCardAction,
  showToast,
}: CardsViewProps) {
  const [essentialCardRevealed, setEssentialCardRevealed] = useState(false);
  const [blackCardRevealed, setBlackCardRevealed] = useState(false);

  return (
    <div className="app-screen active">
      <div className="content-scrollable nav-safe">
        <div className="cards-screen">
          <div className="tab-title">Mes Cartes</div>

          <div className="cards-duo">
            {/* ── CARTE STANDARD : Morali Essentielle ── */}
            <div className="cards-duo-card">
              <div className="cards-duo-tag essentielle">
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                Morali Essentielle
                <div style={{ fontSize: 9, fontWeight: 800, color: "#4ade80", background: "rgba(34,197,94,0.15)", padding: "2px 8px", borderRadius: 6 }}>ACTIF</div>
              </div>
              <div className="card-tilt-wrap">
                <div
                  className={`virtual-card ${cardLocked ? "locked" : ""}`}
                  style={{ transform: cardTransform }}
                  onMouseMove={(e) => onCardMove(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={onCardLeave}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    onCardMove(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect());
                  }}
                  onTouchEnd={onCardLeave}
                  onClick={() => showToast(cardLocked ? "Carte verrouillée" : "Carte virtuelle activée")}
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

                    <div className="vc-number" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEssentialCardRevealed((v) => !v); }}>
                      {essentialCardRevealed ? cardNumber : maskCardNumber(cardNumber)}
                    </div>

                    <div className="vc-bottom-row">
                      <div className="vc-holder-wrap">
                        <div className="vc-holder-l">Titulaire</div>
                        <div className="vc-holder-n" title={holder}>{holder}</div>
                      </div>
                      <div className="vc-ccv-wrap">
                        <div className="vc-ccv-l">CCV</div>
                        <div className="vc-ccv-v">{essentialCardRevealed ? cardCcv : "•••"}</div>
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
                </div>
              </div>
              <div className="cards-duo-info">
                <div className="cards-duo-stat">
                  <div className="cards-duo-stat-val val-up">200K</div>
                  <div className="cards-duo-stat-lbl">Plafond / mois</div>
                </div>
                <div className="cards-duo-stat">
                  <div className="cards-duo-stat-val">50K</div>
                  <div className="cards-duo-stat-lbl">Max / tx</div>
                </div>
                <div className="cards-duo-stat">
                  <button onClick={() => { setEssentialCardRevealed((v) => !v); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <div className="cards-duo-stat-val val-up">Dépenses</div>
                    <div className="cards-duo-stat-lbl">Historique</div>
                  </button>
                </div>
              </div>
              <p className="cards-duo-desc">Paiements SNE, SNDE, Canal+, recharges MTN & Airtel, tontine numérique, micro-épargne et plus encore.</p>
            </div>

            <div className="cards-duo-divider" />

            {/* ── CARTE BLACK : Morali Black Brazzaville ── */}
            <div className="cards-duo-card">
              <div className="cards-duo-tag black-tag">
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                Morali Black
                <div style={{ fontSize: 9, fontWeight: 800, color: "#D4A437", background: "rgba(212,164,55,0.15)", padding: "2px 8px", borderRadius: 6 }}>PREMIUM</div>
              </div>
              <div className="card-tilt-wrap">
                <div
                  className="virtual-card black-card"
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

                    <div className="vc-number" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setBlackCardRevealed((v) => !v); }}>
                      {blackCardRevealed ? blackCardNumber : maskCardNumber(blackCardNumber)}
                    </div>

                    <div className="vc-bottom-row">
                      <div className="vc-holder-wrap">
                        <div className="vc-holder-l">Titulaire</div>
                        <div className="vc-holder-n" title={holder}>{holder}</div>
                      </div>
                      <div className="vc-ccv-wrap">
                        <div className="vc-ccv-l">CCV</div>
                        <div className="vc-ccv-v">{blackCardRevealed ? blackCardCcv : "•••"}</div>
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
              <div className="cards-duo-info">
                <div className="cards-duo-stat">
                  <div className="cards-duo-stat-val val-gold">5M</div>
                  <div className="cards-duo-stat-lbl">Plafond / mois</div>
                </div>
                <div className="cards-duo-stat">
                  <div className="cards-duo-stat-val">1M</div>
                  <div className="cards-duo-stat-lbl">Max / tx</div>
                </div>
                <div className="cards-duo-stat">
                  <button onClick={onHistoryClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <div className="cards-duo-stat-val val-gold">Dépenses</div>
                    <div className="cards-duo-stat-lbl">Historique</div>
                  </button>
                </div>
              </div>
              <p className="cards-duo-desc">Lounge Maya-Maya, virements transfrontaliers, conciergerie 24/7, cashback Congo et accès événements exclusifs.</p>
            </div>
          </div>

          <div className="cards-duo-divider" />

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

          <div className="tip-box">
            <div className="tab-card-icon" style={{ background: "rgba(251,191,36,.1)", color: "#fbbf24", flexShrink: 0 }}>
              <AppIcon name="spark" size={18} stroke="#fbbf24" />
            </div>
            <p className="tip-text">Astuce : Utilisez votre carte Essentielle pour le quotidien et votre carte Black pour les transactions premium.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
