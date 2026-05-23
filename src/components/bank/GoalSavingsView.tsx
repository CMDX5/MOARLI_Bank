'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/bank/Icons";
import type { SavingsGoal, IconName } from "@/types/morali";

/* ─────────────────────────────────────────────
   Props
   ───────────────────────────────────────────── */
interface GoalSavingsViewProps {
  authUid: string | null;
  firestoreBalance: number;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  createRealtimeTransaction: (tx: any) => Promise<void>;
}

/* ─────────────────────────────────────────────
   Goal Templates
   ───────────────────────────────────────────── */
const GOAL_TEMPLATES = [
  { name: "Vacances", icon: "sun" as IconName, color: "#f59e0b", defaultTarget: 300000, emoji: "✈️" },
  { name: "Éducation", icon: "chart" as IconName, color: "#3b82f6", defaultTarget: 500000, emoji: "📚" },
  { name: "Voiture", icon: "flash" as IconName, color: "#8b5cf6", defaultTarget: 2000000, emoji: "🚗" },
  { name: "Urgence", icon: "shield" as IconName, color: "#ef4444", defaultTarget: 200000, emoji: "🛡️" },
  { name: "Mariage", icon: "gift" as IconName, color: "#ec4899", defaultTarget: 1500000, emoji: "💍" },
  { name: "Custom", icon: "spark" as IconName, color: "#22c55e", defaultTarget: 100000, emoji: "✨" },
];

type ModalType = "create" | "addMoney" | "withdraw" | "deleteConfirm" | null;

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
export default function GoalSavingsView({
  authUid,
  firestoreBalance,
  onBack,
  showToast,
  getAuthHeaders,
  createRealtimeTransaction,
}: GoalSavingsViewProps) {
  /* ── State ── */
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [activeGoal, setActiveGoal] = useState<SavingsGoal | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createTarget, setCreateTarget] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [createIcon, setCreateIcon] = useState<IconName>("piggy");
  const [createColor, setCreateColor] = useState("#3b82f6");
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Add/Withdraw form state
  const [amountInput, setAmountInput] = useState("");
  const [amountPin, setAmountPin] = useState("");
  const [amountLoading, setAmountLoading] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  // Delete confirmation
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ── Load goals ── */
  const loadGoals = useCallback(async () => {
    if (!authUid) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/goals", { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.goals)) {
        setGoals(
          data.goals.map((g: any) => ({
            id: g.id,
            name: g.name,
            targetAmount: g.targetAmount,
            currentAmount: g.currentAmount,
            deadline: g.deadline,
            icon: g.icon || "piggy",
            color: g.color || "#3b82f6",
            createdAt: g.createdAt,
          }))
        );
      }
    } catch {
      showToast("Erreur de chargement des objectifs");
    } finally {
      setLoading(false);
    }
  }, [authUid, getAuthHeaders, showToast]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  /* ── Computed ── */
  const totalSaved = useMemo(() => goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0), [goals]);
  const totalTarget = useMemo(() => goals.reduce((sum, g) => sum + (g.targetAmount || 0), 0), [goals]);
  const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  /* ── Create goal ── */
  const handleCreate = async () => {
    if (!createName.trim()) { showToast("Entrez un nom pour l'objectif"); return; }
    const target = Number(createTarget || 0);
    if (target < 1000) { showToast("Montant minimum : 1 000 FCFA"); return; }

    setCreateLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/goals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: createName.trim(),
          targetAmount: target,
          deadline: createDeadline,
          icon: createIcon,
          color: createColor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Objectif créé avec succès");
        closeModal();
        loadGoals();
      } else {
        showToast(data.error || "Erreur lors de la création");
      }
    } catch {
      showToast("Erreur de connexion");
    } finally {
      setCreateLoading(false);
    }
  };

  /* ── Add / Withdraw money ── */
  const handleAmountSubmit = async () => {
    if (!activeGoal || !modal) return;
    const amount = Number(amountInput || 0);
    if (amount < 100) { showToast("Montant minimum : 100 FCFA"); return; }

    if (modal === "addMoney" && amount > firestoreBalance) {
      showToast("Solde insuffisant");
      return;
    }
    if (modal === "withdraw" && amount > (activeGoal.currentAmount || 0)) {
      showToast("Montant supérieur à l'épargne actuelle");
      return;
    }

    setAmountLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          goalId: activeGoal.id,
          action: modal === "addMoney" ? "add" : "withdraw",
          amount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Opération réussie");
        closeModal();
        loadGoals();
      } else {
        showToast(data.error || "Erreur lors de l'opération");
      }
    } catch {
      showToast("Erreur de connexion");
    } finally {
      setAmountLoading(false);
    }
  };

  /* ── Delete goal ── */
  const handleDelete = async () => {
    if (!activeGoal) return;
    setDeleteLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/goals", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ goalId: activeGoal.id }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Objectif supprimé");
        closeModal();
        loadGoals();
      } else {
        showToast(data.error || "Erreur lors de la suppression");
      }
    } catch {
      showToast("Erreur de connexion");
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── Modal helpers ── */
  const openCreateModal = () => {
    setCreateName("");
    setCreateTarget("");
    setCreateDeadline("");
    setCreateIcon("piggy");
    setCreateColor("#3b82f6");
    setSelectedTemplate(null);
    setModal("create");
  };

  const openAddMoney = (goal: SavingsGoal) => {
    setActiveGoal(goal);
    setAmountInput("");
    setAmountPin("");
    setAmountLoading(false);
    setPinVerifying(false);
    setModal("addMoney");
  };

  const openWithdraw = (goal: SavingsGoal) => {
    setActiveGoal(goal);
    setAmountInput("");
    setAmountPin("");
    setAmountLoading(false);
    setPinVerifying(false);
    setModal("withdraw");
  };

  const openDeleteConfirm = (goal: SavingsGoal) => {
    setActiveGoal(goal);
    setDeleteLoading(false);
    setModal("deleteConfirm");
  };

  const closeModal = () => {
    setModal(null);
    setActiveGoal(null);
  };

  /* ── PIN keypad ── */
  const handlePinKey = (value: string) => {
    if (amountLoading || pinVerifying) return;
    if (value === "back") {
      setAmountPin((p) => p.slice(0, -1));
      return;
    }
    if (amountPin.length >= 4) return;
    const next = `${amountPin}${value}`.slice(0, 4);
    setAmountPin(next);
    if (next.length === 4) {
      verifyPinAndSubmit(next);
    }
  };

  const verifyPinAndSubmit = async (pin: string) => {
    setPinVerifying(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers,
        body: JSON.stringify({ pin, uid: authUid || "" }),
      });
      const data = await res.json();
      if (res.status === 429) {
        showToast(data.error || "Trop de tentatives");
        setAmountPin("");
        setPinVerifying(false);
        return;
      }
      if (!res.ok || !data.valid) {
        showToast("Code PIN incorrect");
        setAmountPin("");
        setPinVerifying(false);
        return;
      }
      await handleAmountSubmit();
    } catch {
      showToast("Erreur de connexion");
      setAmountPin("");
      setPinVerifying(false);
    } finally {
      setPinVerifying(false);
    }
  };

  /* ── Progress ring helper ── */
  const progressRing = (percent: number, size: number, strokeWidth: number, color: string) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const formatFCFA = (value: number) =>
    new Intl.NumberFormat("fr-FR").format(Math.abs(value));

  /* ─────────────────────────────────────────────
     Render
     ───────────────────────────────────────────── */
  return (
    <div className="app-screen active">
      <div className="content-scrollable nav-safe">
        <div style={{
          minHeight: "100%",
          background: "#050b1a",
          color: "#fff",
          padding: "0 18px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          {/* ── HEADER ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            paddingBottom: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={onBack}
                style={{
                  width: 38, height: 38, borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer",
                }}
                aria-label="Retour"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </button>
              <div>
                <div style={{
                  fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px",
                  fontFamily: "'Montserrat', sans-serif",
                }}>
                  Épargne Objectif
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Atteignez vos objectifs financiers
                </div>
              </div>
            </div>
            <button
              onClick={openCreateModal}
              style={{
                height: 38, padding: "0 16px", borderRadius: 14,
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none", color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "system-ui, sans-serif",
                boxShadow: "0 4px 14px rgba(59,130,246,0.35)",
              }}
            >
              <AppIcon name="spark" size={14} stroke="#fff" />
              Créer
            </button>
          </div>

          {/* ── OVERVIEW CARD ── */}
          <div style={{
            padding: 20, borderRadius: 22,
            background: "linear-gradient(145deg, rgba(59,130,246,0.1), rgba(37,99,235,0.04))",
            border: "1px solid rgba(59,130,246,0.18)",
            display: "flex", alignItems: "center", gap: 18,
            position: "relative", overflow: "hidden",
          }}>
            {/* Decorative orb */}
            <div style={{
              position: "absolute", top: -20, right: -20,
              width: 100, height: 100, borderRadius: "50%",
              background: "rgba(59,130,246,0.06)",
            }} />

            <div style={{ position: "relative" }}>
              {progressRing(overallProgress, 72, 6, "#3b82f6")}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                transform: "rotate(0deg)",
              }}>
                <span style={{
                  fontSize: 16, fontWeight: 900, fontFamily: "'Montserrat', sans-serif",
                  color: "#60a5fa",
                }}>
                  {overallProgress}%
                </span>
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Total épargné
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.5px" }}>
                {formatFCFA(totalSaved)} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>FCFA</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                sur {formatFCFA(totalTarget)} FCFA • {goals.length} objectif{goals.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* ── BALANCE INFO ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "rgba(34,197,94,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AppIcon name="wallet" size={16} stroke="#4ade80" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Solde disponible
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Montserrat', sans-serif", color: "#4ade80" }}>
                {formatFCFA(firestoreBalance)} FCFA
              </div>
            </div>
          </div>

          {/* ── LOADING ── */}
          {loading && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 14, padding: "40px 20px",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                border: "3px solid rgba(59,130,246,0.18)",
                borderTopColor: "#3b82f6",
                animation: "spin 0.7s linear infinite",
              }} />
              <div style={{ fontSize: 13, color: "#64748b" }}>Chargement de vos objectifs…</div>
            </div>
          )}

          {/* ── EMPTY STATE ── */}
          {!loading && goals.length === 0 && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 16, padding: "36px 20px", textAlign: "center",
            }}>
              {/* Illustration */}
              <div style={{
                width: 100, height: 100, borderRadius: 28,
                background: "linear-gradient(145deg, rgba(59,130,246,0.1), rgba(37,99,235,0.03))",
                border: "1.5px solid rgba(59,130,246,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 44,
              }}>
                🎯
              </div>
              <div>
                <div style={{
                  fontSize: 18, fontWeight: 800, marginBottom: 6,
                  fontFamily: "'Montserrat', sans-serif",
                }}>
                  Aucun objectif créé
                </div>
                <div style={{
                  fontSize: 12, color: "#94a3b8", lineHeight: 1.6,
                  maxWidth: 260, margin: "0 auto",
                }}>
                  Créez votre premier objectif d'épargne pour commencer à épargner
                  intelligemment vers vos rêves.
                </div>
              </div>
              <button
                onClick={openCreateModal}
                style={{
                  height: 48, padding: "0 24px", borderRadius: 16,
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "system-ui, sans-serif",
                  boxShadow: "0 8px 24px rgba(59,130,246,0.35)",
                }}
              >
                <AppIcon name="spark" size={16} stroke="#fff" />
                Créer un objectif
              </button>

              {/* Template suggestions */}
              <div style={{
                width: "100%", marginTop: 8,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  marginBottom: 10, textAlign: "center",
                }}>
                  Suggestions rapides
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
                }}>
                  {GOAL_TEMPLATES.slice(0, 3).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => {
                        setCreateName(t.name);
                        setCreateTarget(String(t.defaultTarget));
                        setCreateIcon(t.icon);
                        setCreateColor(t.color);
                        setSelectedTemplate(GOAL_TEMPLATES.findIndex((gt) => gt.name === t.name));
                        setModal("create");
                      }}
                      style={{
                        padding: "14px 8px", borderRadius: 16,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 6,
                        cursor: "pointer", transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{t.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── GOALS LIST ── */}
          {!loading && goals.length > 0 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {goals.map((goal) => {
                const percent = goal.targetAmount > 0
                  ? Math.round(((goal.currentAmount || 0) / goal.targetAmount) * 100)
                  : 0;
                const isComplete = percent >= 100;
                const daysLeft = goal.deadline
                  ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : null;

                return (
                  <div
                    key={goal.id}
                    style={{
                      padding: 18, borderRadius: 22,
                      background: isComplete
                        ? "linear-gradient(145deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))"
                        : "rgba(255,255,255,0.03)",
                      border: isComplete
                        ? "1px solid rgba(34,197,94,0.2)"
                        : "1px solid rgba(255,255,255,0.06)",
                      display: "flex", flexDirection: "column", gap: 14,
                      position: "relative", overflow: "hidden",
                      transition: "all 0.2s",
                    }}
                  >
                    {/* Decorative glow */}
                    <div style={{
                      position: "absolute", top: -16, right: -16,
                      width: 64, height: 64, borderRadius: "50%",
                      background: isComplete ? "rgba(34,197,94,0.08)" : `${goal.color || "#3b82f6"}10`,
                    }} />

                    {/* Top row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 14,
                      position: "relative",
                    }}>
                      {/* Icon + ring */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {progressRing(percent, 52, 4, isComplete ? "#22c55e" : (goal.color || "#3b82f6"))}
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: "50%",
                          background: isComplete ? "rgba(34,197,94,0.15)" : `${goal.color || "#3b82f6"}18`,
                        }}>
                          <AppIcon
                            name={goal.icon || "piggy"}
                            size={18}
                            stroke={isComplete ? "#4ade80" : (goal.color || "#60a5fa")}
                          />
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          marginBottom: 2,
                        }}>
                          <div style={{
                            fontSize: 15, fontWeight: 800,
                            fontFamily: "'Montserrat', sans-serif",
                            overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {goal.name}
                          </div>
                          {isComplete && (
                            <span style={{
                              fontSize: 8, fontWeight: 900, padding: "2px 6px",
                              borderRadius: 6, letterSpacing: "0.08em",
                              background: "rgba(34,197,94,0.15)", color: "#4ade80",
                              textTransform: "uppercase",
                            }}>
                              Atteint
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 12, color: "#94a3b8", fontWeight: 600,
                        }}>
                          {formatFCFA(goal.currentAmount || 0)} / {formatFCFA(goal.targetAmount)} FCFA
                        </div>
                      </div>

                      {/* More button */}
                      <button
                        onClick={() => openDeleteConfirm(goal)}
                        style={{
                          width: 32, height: 32, borderRadius: 10,
                          background: "rgba(239,68,68,0.08)",
                          border: "1px solid rgba(239,68,68,0.15)",
                          color: "#f87171", display: "flex", alignItems: "center",
                          justifyContent: "center", cursor: "pointer", flexShrink: 0,
                        }}
                        aria-label="Supprimer l'objectif"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div style={{
                        width: "100%", height: 6, borderRadius: 3,
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          background: isComplete
                            ? "linear-gradient(90deg, #22c55e, #4ade80)"
                            : `linear-gradient(90deg, ${goal.color || "#3b82f6"}, ${goal.color || "#60a5fa"})`,
                          width: `${Math.min(percent, 100)}%`,
                          transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
                        }} />
                      </div>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        marginTop: 6,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? "#4ade80" : "#64748b" }}>
                          {percent}%
                        </span>
                        {daysLeft !== null && !isComplete && (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: daysLeft <= 7 ? "#f87171" : "#64748b",
                          }}>
                            {daysLeft === 0 ? "Dernier jour !" : `${daysLeft}j restant${daysLeft > 1 ? "s" : ""}`}
                          </span>
                        )}
                        {goal.deadline && !isComplete && daysLeft === null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                            {formatDate(goal.deadline)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                    }}>
                      <button
                        onClick={() => openAddMoney(goal)}
                        disabled={isComplete}
                        style={{
                          height: 42, borderRadius: 14,
                          background: isComplete ? "rgba(255,255,255,0.02)" : "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.08))",
                          border: isComplete ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(59,130,246,0.2)",
                          color: isComplete ? "#64748b" : "#60a5fa",
                          fontSize: 12, fontWeight: 700, cursor: isComplete ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          fontFamily: "system-ui, sans-serif",
                          transition: "all 0.2s",
                        }}
                      >
                        <AppIcon name="coins" size={14} stroke={isComplete ? "#64748b" : "#60a5fa"} />
                        {isComplete ? "Complété" : "Ajouter"}
                      </button>
                      <button
                        onClick={() => openWithdraw(goal)}
                        disabled={(goal.currentAmount || 0) <= 0}
                        style={{
                          height: 42, borderRadius: 14,
                          background: (goal.currentAmount || 0) <= 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                          border: (goal.currentAmount || 0) <= 0 ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(255,255,255,0.08)",
                          color: (goal.currentAmount || 0) <= 0 ? "#64748b" : "#94a3b8",
                          fontSize: 12, fontWeight: 700,
                          cursor: (goal.currentAmount || 0) <= 0 ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          fontFamily: "system-ui, sans-serif",
                          transition: "all 0.2s",
                        }}
                      >
                        <AppIcon name="receive" size={14} stroke={(goal.currentAmount || 0) <= 0 ? "#64748b" : "#94a3b8"} />
                        Retirer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TIP BOX ── */}
          {!loading && goals.length > 0 && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "14px 16px", borderRadius: 16,
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.12)",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: "rgba(251,191,36,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AppIcon name="spark" size={16} stroke="#fbbf24" />
              </div>
              <p style={{
                fontSize: 11, color: "#94a3b8", lineHeight: 1.55, margin: 0,
              }}>
                <strong style={{ color: "#fbbf24" }}>Astuce :</strong> Épargnez régulièrement,
                même de petites sommes. L'automatisation est la clé pour atteindre vos objectifs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          MODALS
         ════════════════════════════════════════ */}

      {/* ── CREATE GOAL MODAL ── */}
      {modal === "create" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(3,8,16,0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          animation: "fadeIn 0.25s ease",
        }} onClick={closeModal}>
          <div
            style={{
              width: "100%", maxWidth: 430,
              background: "linear-gradient(180deg, #0c1528 0%, #080f1e 100%)",
              border: "1px solid rgba(59,130,246,0.18)",
              borderRadius: "24px 24px 0 0",
              padding: "20px 20px 32px",
              display: "flex", flexDirection: "column", gap: 18,
              maxHeight: "90vh", overflowY: "auto",
              animation: "slideUp 0.3s cubic-bezier(.34,1.56,.64,1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Montserrat', sans-serif" }}>
                  Nouvel objectif
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Définissez votre objectif d'épargne
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  width: 36, height: 36, borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer",
                  fontSize: 20, lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Template selector */}
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#64748b",
                textTransform: "uppercase", letterSpacing: "0.1em",
                marginBottom: 10,
              }}>
                Modèle
              </div>
              <div style={{
                display: "flex", gap: 8, overflowX: "auto",
                scrollbarWidth: "none", paddingBottom: 2,
              }}>
                {GOAL_TEMPLATES.map((t, i) => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setSelectedTemplate(i);
                      setCreateName(t.name === "Custom" ? "" : t.name);
                      setCreateTarget(String(t.defaultTarget));
                      setCreateIcon(t.icon);
                      setCreateColor(t.color);
                    }}
                    style={{
                      flexShrink: 0, padding: "10px 14px", borderRadius: 14,
                      background: selectedTemplate === i
                        ? `${t.color}15`
                        : "rgba(255,255,255,0.03)",
                      border: selectedTemplate === i
                        ? `1.5px solid ${t.color}40`
                        : "1px solid rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", transition: "all 0.2s",
                      color: selectedTemplate === i ? t.color : "#94a3b8",
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    <span>{t.emoji}</span>
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{
                fontSize: 11, fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                Nom de l'objectif
              </label>
              <input
                type="text"
                placeholder="Ex: Vacances à Dubaï"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                style={{
                  width: "100%", height: 48, padding: "0 16px",
                  borderRadius: 14, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", fontSize: 14, outline: "none",
                  fontFamily: "system-ui, sans-serif",
                }}
              />
            </div>

            {/* Target amount */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{
                fontSize: 11, fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                Montant cible (FCFA)
              </label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="500 000"
                value={createTarget}
                onChange={(e) => setCreateTarget(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                style={{
                  width: "100%", height: 48, padding: "0 16px",
                  borderRadius: 14, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", fontSize: 18, fontWeight: 800,
                  outline: "none", fontFamily: "'Montserrat', sans-serif",
                }}
              />
              {/* Quick presets */}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {[50000, 100000, 250000, 500000, 1000000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setCreateTarget(String(preset))}
                    style={{
                      flex: 1, height: 32, borderRadius: 10,
                      background: createTarget === String(preset)
                        ? "rgba(59,130,246,0.15)"
                        : "rgba(255,255,255,0.03)",
                      border: createTarget === String(preset)
                        ? "1px solid rgba(59,130,246,0.25)"
                        : "1px solid rgba(255,255,255,0.06)",
                      color: createTarget === String(preset) ? "#60a5fa" : "#64748b",
                      fontSize: 10, fontWeight: 700, cursor: "pointer",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {preset >= 1000000 ? `${preset / 1000000}M` : `${preset / 1000}K`}
                  </button>
                ))}
              </div>
            </div>

            {/* Deadline */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{
                fontSize: 11, fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                Date limite (optionnel)
              </label>
              <input
                type="date"
                value={createDeadline}
                onChange={(e) => setCreateDeadline(e.target.value)}
                style={{
                  width: "100%", height: 48, padding: "0 16px",
                  borderRadius: 14, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", fontSize: 14, outline: "none",
                  fontFamily: "system-ui, sans-serif",
                  colorScheme: "dark",
                }}
              />
            </div>

            {/* Icon + Color row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: "#94a3b8",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  Icône
                </label>
                <div style={{
                  height: 48, borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "0 12px",
                }}>
                  {(["piggy", "coins", "target", "shield", "spark", "home"] as IconName[]).map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setCreateIcon(icon)}
                      style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: createIcon === icon
                          ? `${createColor}20`
                          : "transparent",
                        border: createIcon === icon
                          ? `1px solid ${createColor}50`
                          : "1px solid transparent",
                        display: "flex", alignItems: "center",
                        justifyContent: "center", cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <AppIcon
                        name={icon}
                        size={16}
                        stroke={createIcon === icon ? createColor : "#64748b"}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: "#94a3b8",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  Couleur
                </label>
                <div style={{
                  height: 48, borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  padding: "0 12px",
                }}>
                  {["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#22c55e", "#ef4444"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCreateColor(c)}
                      style={{
                        width: 24, height: 24, borderRadius: 8,
                        background: c, cursor: "pointer",
                        border: createColor === c ? "2px solid #fff" : "2px solid transparent",
                        transition: "all 0.15s",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={createLoading || !createName.trim() || Number(createTarget || 0) < 1000}
              style={{
                width: "100%", height: 52, borderRadius: 16,
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none", color: "#fff", fontSize: 15, fontWeight: 800,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8,
                fontFamily: "system-ui, sans-serif",
                boxShadow: "0 8px 24px rgba(59,130,246,0.35)",
                opacity: (createLoading || !createName.trim() || Number(createTarget || 0) < 1000) ? 0.5 : 1,
              }}
            >
              {createLoading ? (
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                }} />
              ) : (
                <>
                  <AppIcon name="spark" size={16} stroke="#fff" />
                  Créer l'objectif
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── ADD / WITHDRAW MONEY MODAL ── */}
      {(modal === "addMoney" || modal === "withdraw") && activeGoal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(3,8,16,0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          animation: "fadeIn 0.25s ease",
        }} onClick={closeModal}>
          <div
            style={{
              width: "100%", maxWidth: 430,
              background: "linear-gradient(180deg, #0c1528 0%, #080f1e 100%)",
              border: "1px solid rgba(59,130,246,0.18)",
              borderRadius: "24px 24px 0 0",
              padding: "20px 20px 32px",
              display: "flex", flexDirection: "column", gap: 18,
              animation: "slideUp 0.3s cubic-bezier(.34,1.56,.64,1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Montserrat', sans-serif" }}>
                  {modal === "addMoney" ? "Ajouter" : "Retirer"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {modal === "addMoney"
                    ? `Épargner pour « ${activeGoal.name} »`
                    : `Retirer de « ${activeGoal.name} »`}
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  width: 36, height: 36, borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer",
                  fontSize: 20, lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Goal preview */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${activeGoal.color || "#3b82f6"}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AppIcon name={activeGoal.icon || "piggy"} size={20} stroke={activeGoal.color || "#60a5fa"} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{activeGoal.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {formatFCFA(activeGoal.currentAmount || 0)} / {formatFCFA(activeGoal.targetAmount)} FCFA
                </div>
              </div>
            </div>

            {/* Amount display */}
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{
                fontSize: 32, fontWeight: 900, fontFamily: "'Montserrat', sans-serif",
                color: modal === "addMoney" ? "#60a5fa" : "#fbbf24",
                letterSpacing: "-0.5px",
              }}>
                {modal === "addMoney" ? "+" : "-"}{formatFCFA(Number(amountInput || 0))} FCFA
              </div>
            </div>

            {/* Amount input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                style={{
                  flex: 1, height: 52, padding: "0 18px",
                  borderRadius: 16, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff", fontSize: 22, fontWeight: 900,
                  textAlign: "center", outline: "none",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              />
            </div>

            {/* Quick amounts */}
            <div style={{ display: "flex", gap: 6 }}>
              {modal === "addMoney"
                ? [1000, 5000, 10000, 25000, 50000].map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmountInput(String(p))}
                    style={{
                      flex: 1, height: 34, borderRadius: 10,
                      background: amountInput === String(p)
                        ? "rgba(59,130,246,0.15)"
                        : "rgba(255,255,255,0.03)",
                      border: amountInput === String(p)
                        ? "1px solid rgba(59,130,246,0.25)"
                        : "1px solid rgba(255,255,255,0.06)",
                      color: amountInput === String(p) ? "#60a5fa" : "#64748b",
                      fontSize: 10, fontWeight: 700, cursor: "pointer",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {p >= 1000 ? `${p / 1000}K` : p}
                  </button>
                ))
                : [1000, 5000, 10000, 25000].map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmountInput(String(p))}
                    style={{
                      flex: 1, height: 34, borderRadius: 10,
                      background: amountInput === String(p)
                        ? "rgba(251,191,36,0.15)"
                        : "rgba(255,255,255,0.03)",
                      border: amountInput === String(p)
                        ? "1px solid rgba(251,191,36,0.25)"
                        : "1px solid rgba(255,255,255,0.06)",
                      color: amountInput === String(p) ? "#fbbf24" : "#64748b",
                      fontSize: 10, fontWeight: 700, cursor: "pointer",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {p >= 1000 ? `${p / 1000}K` : p}
                  </button>
                ))
              }
            </div>

            {/* PIN verification */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Code PIN de confirmation
              </div>

              {/* PIN dots */}
              <div style={{ display: "flex", gap: 14 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: `2px solid ${i < amountPin.length ? (pinVerifying ? "rgba(59,130,246,0.5)" : "#3b82f6") : "rgba(148,163,184,0.35)"}`,
                      background: i < amountPin.length
                        ? pinVerifying
                          ? "rgba(59,130,246,0.3)"
                          : "#3b82f6"
                        : "transparent",
                      transition: "all 0.2s",
                      boxShadow: i < amountPin.length && !pinVerifying ? "0 0 12px rgba(59,130,246,0.4)" : "none",
                    }}
                  />
                ))}
              </div>

              {pinVerifying && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid rgba(59,130,246,0.3)",
                    borderTopColor: "#3b82f6",
                    animation: "spin 0.7s linear infinite",
                  }} />
                  <span style={{ fontSize: 12, color: "#64748b" }}>Vérification…</span>
                </div>
              )}

              {/* Keypad */}
              {!pinVerifying && (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
                  width: "100%",
                }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, index) =>
                    key ? (
                      <button
                        key={key + index}
                        onClick={() => handlePinKey(key)}
                        style={{
                          width: "100%", height: 54, borderRadius: 14,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          color: "#fff", fontSize: 22, fontWeight: 700,
                          cursor: "pointer", fontFamily: "'Montserrat', sans-serif",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {key === "back" ? "⌫" : key}
                      </button>
                    ) : (
                      <div key={`empty-${index}`} style={{ height: 54 }} />
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {modal === "deleteConfirm" && activeGoal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(3,8,16,0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
          animation: "fadeIn 0.25s ease",
        }} onClick={closeModal}>
          <div
            style={{
              width: "100%", maxWidth: 340,
              background: "linear-gradient(180deg, #0c1528 0%, #080f1e 100%)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 24,
              padding: 28,
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 16, textAlign: "center",
              animation: "slideUp 0.3s cubic-bezier(.34,1.56,.64,1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning icon */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(239,68,68,0.1)",
              border: "1.5px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <div>
              <div style={{
                fontSize: 17, fontWeight: 800, marginBottom: 6,
                fontFamily: "'Montserrat', sans-serif",
              }}>
                Supprimer cet objectif ?
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                « {activeGoal.name} » sera définitivement supprimé.
                {(activeGoal.currentAmount || 0) > 0 && (
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {" "}{formatFCFA(activeGoal.currentAmount)} FCFA seront restitués.
                  </span>
                )}
              </div>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, width: "100%",
              marginTop: 4,
            }}>
              <button
                onClick={closeModal}
                style={{
                  height: 48, borderRadius: 14,
                  background: "rgba(255,255,255,0.06)",
                  border: "none", color: "#fff", fontSize: 14,
                  fontWeight: 700, cursor: "pointer",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{
                  height: 48, borderRadius: 14,
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  border: "none", color: "#fff", fontSize: 14,
                  fontWeight: 700, cursor: "pointer",
                  fontFamily: "system-ui, sans-serif",
                  boxShadow: "0 8px 24px rgba(239,68,68,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  opacity: deleteLoading ? 0.5 : 1,
                }}
              >
                {deleteLoading ? (
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "spin 0.7s linear infinite",
                  }} />
                ) : (
                  "Supprimer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
