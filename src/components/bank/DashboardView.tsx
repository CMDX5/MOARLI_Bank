'use client';
import React from "react";
import type { Transaction, NotificationItem, TransactionType } from "@/types/morali";
import { formatCurrency, formatStat, timeAgo } from "@/lib/helpers";
import { MoraliShield, AppIcon, renderQuickActionIcon } from "./Icons";

// ── Chart day shape ──
export interface ChartDay {
  label: string;
  day: number;
  month: number;
  year: number;
  dateStr: string;
}

// ── Sparkline SVG path data ──
export interface SparklinePath {
  curveLine: string;
  fillArea: string;
  endPt: { x: number; y: number };
}

// ── Chart data from buildChartData ──
export interface ChartData {
  heights: number[];
  amounts: number[];
  netFlow: number[];
  trajectory: number[];
}

// ── Dashboard data computed from user info ──
export interface DashboardData {
  balance: number;
  income: number;
  expenses: number;
  savingsRate: string;
  totalStats: string;
  holder: string;
  initials: string;
  cardNumber: string;
  blackCardNumber: string;
  cardExp: string;
  cardCcv: string;
  blackCardExp: string;
  blackCardCcv: string;
  transactions: Transaction[];
}

// ── Quick action item ──
interface QuickAction {
  readonly label: string;
  readonly icon: "wallet" | "receive" | "service" | "transfer";
  readonly message: string;
  readonly action: "depot" | "retrait" | "service" | "transfer";
}

const quickActions: QuickAction[] = [
  { label: "Dépôt", icon: "wallet", message: "Effectuer un dépôt", action: "depot" },
  { label: "Retrait", icon: "receive", message: "Effectuer un retrait", action: "retrait" },
  { label: "Services", icon: "service", message: "Accéder aux services", action: "service" },
  { label: "Transférer", icon: "transfer", message: "Transférer des fonds", action: "transfer" },
];

// ── Props ──
export interface DashboardViewProps {
  /* Display data */
  dashboardName: string;
  dashboardData: DashboardData;
  chartBalance: number;
  sparklinePath: SparklinePath;
  chartDays: ChartDay[];
  weeklyStats: { income: number; expenses: number; savingsRate: string; txCount: string };
  chartData: ChartData;
  dynamicChartDays: ChartDay[];
  liveTransactions: Transaction[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;

  /* Card state */
  cardLocked: boolean;
  setCardLocked: React.Dispatch<React.SetStateAction<boolean>>;
  cardGenerating: boolean;
  handleCardGenerate: () => void;
  cardTransform: string;
  handleCardMove: (clientX: number, clientY: number, rect: DOMRect) => void;
  setCardTransform: React.Dispatch<React.SetStateAction<string>>;
  cardNumberRevealed: boolean;
  activeCardNumber: string;
  maskCardNumber: (num: string) => string;
  toggleCardNumberReveal: () => void;
  activeCardCcv: string;
  activeCardExp: string;

  /* UI state */
  chartPeriod: "7j" | "30j" | "6m";
  setChartPeriod: React.Dispatch<React.SetStateAction<"7j" | "30j" | "6m">>;
  chartTooltip: { index: number } | null;
  setChartTooltip: React.Dispatch<React.SetStateAction<{ index: number } | null>>;
  notificationsOpen: boolean;
  setNotificationsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyModalOpen: boolean;
  setHistoryModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  /* Callbacks */
  renderProtectedAmount: (key: string, text: string, className?: string) => React.ReactNode;
  showToast: (message: string) => void;
  openTransaction: (type: TransactionType) => void;
  openServices: () => void;
  openPaymentsTab: () => void;
}

export default function DashboardView({
  dashboardName,
  dashboardData,
  chartBalance,
  sparklinePath,
  chartDays,
  weeklyStats,
  chartData,
  dynamicChartDays,
  liveTransactions,
  unreadNotificationsCount,
  cardLocked,
  setCardLocked,
  cardGenerating,
  handleCardGenerate,
  cardTransform,
  handleCardMove,
  setCardTransform,
  cardNumberRevealed,
  activeCardNumber,
  maskCardNumber,
  toggleCardNumberReveal,
  activeCardCcv,
  activeCardExp,
  chartPeriod,
  setChartPeriod,
  chartTooltip,
  setChartTooltip,
  notificationsOpen,
  setNotificationsOpen,
  historyModalOpen,
  setHistoryModalOpen,
  renderProtectedAmount,
  showToast,
  openTransaction,
  openServices,
  openPaymentsTab,
}: DashboardViewProps) {
  return (
    <div className={`app-screen ${true ? "active" : ""}`}>
      <div className="content-scrollable dashboard-mode">
        <div className="top-header">
          <div className="brand-row">
            <div style={{ transform: "scale(1.08)", transformOrigin: "left center" }}>
              <MoraliShield small />
            </div>
            <div className="brand-text-wrap">
              <div className="brand-name">MORALI</div>
              <div className="brand-sub-lbl">PAY</div>
            </div>
          </div>
          <div className="top-actions" style={{ position: "relative" }}>
            <button
              className="icon-pill"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-label="Ouvrir les notifications"
              style={{
                border: notificationsOpen ? "1px solid rgba(59,130,246,.35)" : undefined,
                boxShadow: notificationsOpen ? "0 0 0 3px rgba(59,130,246,.12)" : undefined,
              }}
            >
              <AppIcon name="bell" size={17} stroke="rgba(255,255,255,0.72)" />
              {unreadNotificationsCount > 0 && <div className="notif-dot" />}
            </button>
            <div className="icon-pill">
              <div style={{ width: 25, height: 25, borderRadius: "50%", background: "linear-gradient(135deg,#1A3E78,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Montserrat, sans-serif", fontSize: 9.5, fontWeight: 800, color: "#fff" }}>
                {dashboardData.initials || "U"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Greeting ── */}
        <div className="greeting">
          <div className="g-name">
            <span className="g-name-txt">Bonjour {dashboardName.split(" ")[0]}</span>
            <span style={{ display: "flex", alignItems: "center", color: "#60a5fa", opacity: 0.9 }}>
              <AppIcon name="spark" size={16} stroke="#60a5fa" />
            </span>
          </div>
          <div className="g-sub">
            Votre espace financier sécurisé
          </div>
        </div>

        {/* ── Balance Card ── */}
        <div className="balance-card">
          <div className="bc-gold-top" />
          <div className="bc-glow-edge" />
          <div className="bc-glow-edge right" />
          <div className="bc-orb" />
          <div className="bc-orb2" />

          <div className="bc-sparkline">
            <svg viewBox="0 0 320 72" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="spk-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(59,130,246,0.22)" />
                  <stop offset="100%" stopColor="rgba(59,130,246,0)" />
                </linearGradient>
                <filter id="spk-glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path d={sparklinePath.fillArea} fill="url(#spk-grad)" />
              <path d={sparklinePath.curveLine} fill="none" stroke="rgba(59,130,246,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#spk-glow)" />
              <circle cx={sparklinePath.endPt.x} cy={sparklinePath.endPt.y} r="3.5" fill="#3b82f6" opacity="0.9" />
              <circle cx={sparklinePath.endPt.x} cy={sparklinePath.endPt.y} r="6" fill="rgba(59,130,246,0.25)" />
            </svg>
          </div>

          <div className="bc-label">Solde disponible</div>
          <div className="bc-amount"><span className="bc-amount-cur">FCFA</span>{renderProtectedAmount("balance", formatCurrency(chartBalance))}</div>
          <div className="bc-sub">Compte courant — Congo</div>
          <div className="bc-chart-labels">
            {chartDays.map((day, i) => {
              const d = new Date();
              d.setDate(day.day);
              d.setMonth(day.month);
              const dayName = d.toLocaleDateString("fr-FR", { weekday: "short" });
              const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
              return <span key={day.label}>{dayLabel}</span>;
            })}
          </div>
          <div className="bc-divider" />
          <div className="bc-stats">
            <div className="bc-stat">
              <div className="bc-stat-l">Revenus</div>
              <div className="bc-stat-v up">{formatStat(weeklyStats.income, "credit")}</div>
            </div>
            <div className="bc-stat">
              <div className="bc-stat-l">Dépenses</div>
              <div className="bc-stat-v dn">{formatStat(weeklyStats.expenses, "debit")}</div>
            </div>
            <div className="bc-stat">
              <div className="bc-stat-l">Épargne</div>
              <div className="bc-stat-v gd">{weeklyStats.savingsRate}</div>
            </div>
          </div>
        </div>

        {/* ── Virtual Card ── */}
        <div className="section-header card-section-header">
          <span className="section-title" style={{ color: "var(--gold)" }}>Votre carte bancaire</span>
          <div className="card-section-toggle">
            <div
              className={`section-card-switch ${cardLocked ? "active" : ""}`}
              role="switch"
              aria-checked={cardLocked}
              aria-label={cardLocked ? "Activer la carte" : "Geler la carte"}
              onClick={() => {
                setCardLocked((locked) => !locked);
                if (window.navigator.vibrate) window.navigator.vibrate(10);
                showToast(cardLocked ? "Carte activée" : "Carte gelée");
              }}
            >
              <div className="switch-dot" />
            </div>
          </div>
          <span className="section-action" onClick={handleCardGenerate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {cardGenerating ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, border: "2px solid var(--blue)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                Génération...
              </span>
            ) : "Générer"}
          </span>
        </div>

        <div className="card-tilt-wrap">
          <div
            className={`virtual-card ${cardLocked ? "locked" : ""}`}
            style={{ transform: cardTransform }}
            onMouseMove={(e) => handleCardMove(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setCardTransform("rotateX(4deg) rotateY(-3deg)")}
            onTouchMove={(e) => {
              const t = e.touches[0];
              handleCardMove(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect());
            }}
            onTouchEnd={() => setCardTransform("rotateX(4deg) rotateY(-3deg)")}
            onClick={() => showToast(cardLocked ? "Carte gelée" : "Carte virtuelle activée")}
          >
            {cardLocked && (
              <div style={{
                position: "absolute", top: 14, right: 14, zIndex: 10,
                background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.4)",
                borderRadius: 8, padding: "4px 10px",
                fontSize: 9, fontWeight: 800, color: "#22d3ee",
                letterSpacing: 1, textTransform: "uppercase",
                backdropFilter: "blur(8px)",
              }}>
                ❄ Carte Gelée
              </div>
            )}
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

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                <div className="vc-number" style={{ margin: 0 }}>
                  {cardNumberRevealed ? activeCardNumber : maskCardNumber(activeCardNumber)}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cardLocked) {
                      showToast("Dégelez la carte pour voir les numéros");
                      return;
                    }
                    toggleCardNumberReveal();
                  }}
                  style={{
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6, padding: "3px 5px", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                  aria-label={cardNumberRevealed ? "Masquer le numéro" : "Afficher le numéro"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={cardNumberRevealed ? "#60a5fa" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {cardNumberRevealed ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>

              <div className="vc-bottom-row">
                <div className="vc-holder-wrap">
                  <div className="vc-holder-l">Titulaire</div>
                  <div className="vc-holder-n" title={dashboardData.holder}>{dashboardData.holder}</div>
                </div>
                <div className="vc-ccv-wrap">
                  <div className="vc-ccv-l">CCV</div>
                  <div className="vc-ccv-v">{cardNumberRevealed ? activeCardCcv : "•••"}</div>
                </div>
                <div className="vc-exp-visa-wrap">
                  <div className="vc-exp-wrap">
                    <div className="vc-exp">
                      <div className="vc-exp-l">Expire</div>
                      <div className="vc-exp-v">{activeCardExp}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="section-header">
          <span className="section-title" style={{ color: "var(--gold)" }}>Actions rapides</span>
        </div>
        <div className="qa-wrap">
          <div className="qa-grid">
            {quickActions.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`qa-btn ${item.action === "depot" ? "active-blue" : ""}`}
                onClick={() => {
                  if (item.action === "depot") {
                    openTransaction("depot");
                    return;
                  }
                  if (item.action === "retrait") {
                    openTransaction("retrait");
                    return;
                  }
                  if (item.action === "service") {
                    openServices();
                    return;
                  }
                  if (item.action === "transfer") {
                    openPaymentsTab();
                    return;
                  }
                  showToast("Action rapide");
                }}
              >
                <div className="qa-circle">
                  {renderQuickActionIcon(item.icon)}
                </div>
                <span className="qa-lbl">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Statistics Chart ── */}
        <div className="section-header" style={{ marginTop: 4 }}>
          <span className="section-title" style={{ color: "var(--gold)" }}>Statistiques</span>
          <span className="section-action" onClick={() => { setChartPeriod(p => p === "7j" ? "30j" : p === "30j" ? "6m" : "7j"); }}>{chartPeriod}</span>
        </div>
        <div className="stats-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--dim)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Transactions</div>
              <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{weeklyStats.txCount}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#22c55e" }} /><span style={{ fontSize: 8, color: "var(--dim)", fontWeight: 600 }}>Revenus</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }} /><span style={{ fontSize: 8, color: "var(--dim)", fontWeight: 600 }}>Dépenses</span></div>
            </div>
          </div>
          <div className="chart-area" style={{ position: "relative" }}>
            {chartData.heights.map((height, i) => {
              const flow = chartData.netFlow[i];
              const isPositive = flow >= 0;
              const barColor = isPositive
                ? "linear-gradient(180deg,rgba(34,197,94,0.7) 0%,rgba(34,197,94,0.2) 100%)"
                : "linear-gradient(180deg,rgba(239,68,68,0.7) 0%,rgba(239,68,68,0.2) 100%)";
              const hiColor = isPositive
                ? "linear-gradient(180deg,rgba(34,197,94,0.95) 0%,rgba(16,185,129,0.5) 100%)"
                : "linear-gradient(180deg,rgba(239,68,68,0.95) 0%,rgba(220,38,38,0.5) 100%)";
              const dotColor = isPositive ? "#22c55e" : "#ef4444";
              const isLast = i === chartData.heights.length - 1;
              return (
                <div key={i} className="chart-line-wrap" style={{ position: "relative" }}>
                  <div
                    className={`chart-bar ${isLast ? "hi" : ""}`}
                    style={{
                      height,
                      background: isLast ? hiColor : barColor,
                      cursor: "pointer",
                      boxShadow: isLast ? `0 0 12px ${dotColor}40, 0 -3px 10px ${dotColor}30` : "none",
                    }}
                    onClick={() => setChartTooltip(chartTooltip?.index === i ? null : { index: i })}
                    onMouseEnter={() => setChartTooltip({ index: i })}
                    onMouseLeave={() => setChartTooltip(null)}
                  />
                  {isLast && (
                    <div style={{
                      position: "absolute", top: -3, left: "50%", transform: "translateX(-50%)",
                      width: 6, height: 6, borderRadius: "50%", background: dotColor,
                      boxShadow: `0 0 8px ${dotColor}`,
                    }} />
                  )}
                  {chartTooltip?.index === i && (
                    <div style={{
                      position: "absolute", top: -38, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(10,20,40,.95)", border: `1px solid ${isPositive ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)"}`,
                      borderRadius: 10, padding: "5px 10px", whiteSpace: "nowrap", zIndex: 10,
                      pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,.4)",
                      fontSize: 11, fontWeight: 700, color: isPositive ? "#4ade80" : "#f87171",
                      fontFamily: "'Montserrat',sans-serif", textAlign: "center", lineHeight: 1.3,
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: isPositive ? "rgba(74,222,128,.6)" : "rgba(248,113,113,.6)", marginBottom: 1 }}>
                        {isPositive ? "↑ Revenu" : "↓ Dépense"}
                      </div>
                      {formatCurrency(chartData.amounts[i])} XAF
                      <div style={{
                        position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
                        width: 0, height: 0, borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent", borderTop: `4px solid ${isPositive ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)"}`,
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="chart-labels">
            {dynamicChartDays.map((day) => <span key={day.label}>{day.label}</span>)}
          </div>
        </div>

        {/* ── Recent Transactions ── */}
        <div className="section-header" style={{ marginTop: 8 }}>
          <span className="section-title" style={{ color: "var(--gold)" }}>Transactions récentes</span>
          <span className="section-action" onClick={() => setHistoryModalOpen(true)}>Voir tout</span>
        </div>
        <div className="tx-section">
          {(() => {
            const txList = liveTransactions.length ? liveTransactions : dashboardData.transactions;
            if (txList.length === 0) {
              return (
                <div style={{ padding: "32px 16px", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, margin: "0 auto 12px", borderRadius: 18, background: "linear-gradient(135deg, rgba(212,164,55,0.15), rgba(26,62,120,0.2))", border: "1px solid rgba(212,164,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20"/><path d="M8 3v4"/><path d="M16 3v4"/><circle cx="12" cy="14" r="2"/></svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)", lineHeight: 1.5 }}>Aucune transaction pour le moment.<br />Effectuez un dépôt ou un virement pour commencer.</div>
                </div>
              );
            }
            return txList.map((tx, idx) => (
              <div className="tx-item" key={tx.receiptId || `${tx.name}-${tx.date}-${idx}`} onClick={() => showToast(`${tx.name} · ${tx.amount}`)}>
                <div className="tx-ico" style={{ background: tx.bg }}>
                  <AppIcon
                    name={tx.icon}
                    size={18}
                    stroke={tx.type === "credit" ? "#60a5fa" : tx.icon === "bolt" ? "#D4A437" : "rgba(255,255,255,0.82)"}
                  />
                </div>
                <div className="tx-info">
                  <div className="tx-name">{tx.name}</div>
                  <div className="tx-date">{tx.dateTimestamp ? timeAgo(tx.dateTimestamp) : tx.date}</div>
                </div>
                <div className="tx-right">
                  <div className={`tx-amt ${tx.type === "credit" ? "cr" : "dr"}`}>{renderProtectedAmount(`tx-${tx.name}`, tx.amount)}</div>
                  <div className="tx-cat">{tx.category}</div>
                </div>
              </div>
            ));
          })()}
        </div>

        {/* ── Full Transaction History Modal ── */}
        {historyModalOpen && (
          <div
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
              zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
              padding: 16,
            }}
            onClick={() => setHistoryModalOpen(false)}
          >
            <div
              style={{
                background: "linear-gradient(180deg, #0a1628 0%, #050b1a 100%)",
                border: "1px solid rgba(212,164,55,0.18)",
                borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "85dvh",
                display: "flex", flexDirection: "column", overflow: "hidden",
                boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(212,164,55,0.05)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 20px", borderBottom: "1px solid rgba(212,164,55,0.12)",
              }}>
                <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                  Historique des transactions
                </span>
                <button
                  onClick={() => setHistoryModalOpen(false)}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(212,164,55,0.25)",
                    background: "rgba(212,164,55,0.08)", color: "var(--gold)", fontSize: 18,
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
              {/* Modal body */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "8px 12px",
                scrollbarWidth: "thin", scrollbarColor: "rgba(212,164,55,0.3) transparent",
              }}>
                {(() => {
                  const allTx = liveTransactions.length ? liveTransactions : dashboardData.transactions;
                  if (allTx.length === 0) {
                    return (
                      <div style={{ padding: "32px 16px", textAlign: "center" }}>
                        <div style={{ width: 64, height: 64, margin: "0 auto 12px", borderRadius: 18, background: "linear-gradient(135deg, rgba(212,164,55,0.15), rgba(26,62,120,0.2))", border: "1px solid rgba(212,164,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20"/><path d="M8 3v4"/><path d="M16 3v4"/><circle cx="12" cy="14" r="2"/></svg>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)", lineHeight: 1.5 }}>
                          Aucune transaction pour le moment.
                        </div>
                      </div>
                    );
                  }
                  return allTx.map((tx, idx) => (
                    <div className="tx-item" key={tx.receiptId || `${tx.name}-hist-${idx}`}>
                      <div className="tx-ico" style={{ background: tx.bg }}>
                        <AppIcon
                          name={tx.icon}
                          size={18}
                          stroke={tx.type === "credit" ? "#60a5fa" : tx.icon === "bolt" ? "#D4A437" : "rgba(255,255,255,0.82)"}
                        />
                      </div>
                      <div className="tx-info">
                        <div className="tx-name">{tx.name}</div>
                        <div className="tx-date">{tx.dateTimestamp ? timeAgo(tx.dateTimestamp) : tx.date}</div>
                      </div>
                      <div className="tx-right">
                        <div className={`tx-amt ${tx.type === "credit" ? "cr" : "dr"}`}>{renderProtectedAmount(`hist-${tx.name}`, tx.amount)}</div>
                        <div className="tx-cat">{tx.category}</div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
