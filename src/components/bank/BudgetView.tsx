'use client';
import React, { useState, useEffect, useCallback } from "react";
import type { BudgetCategory, MonthlyBudget, IconName } from "@/types/morali";
import { formatCurrency } from "@/lib/helpers";

// ── Props ──
interface BudgetViewProps {
  authUid: string | null;
  firestoreBalance: number;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

// ── Default categories ──
const DEFAULT_CATEGORIES: BudgetCategory[] = [
  { id: "alimentation", name: "Alimentation", icon: "cart", allocated: 0, spent: 0, color: "#22c55e" },
  { id: "transport", name: "Transport", icon: "swap", allocated: 0, spent: 0, color: "#3b82f6" },
  { id: "communication", name: "Communication", icon: "phone", allocated: 0, spent: 0, color: "#8b5cf6" },
  { id: "loisirs", name: "Loisirs", icon: "spark", allocated: 0, spent: 0, color: "#f59e0b" },
  { id: "sante", name: "Santé", icon: "shield", allocated: 0, spent: 0, color: "#ef4444" },
  { id: "autres", name: "Autres", icon: "grid", allocated: 0, spent: 0, color: "#64748b" },
];

// ── Category icon renderer (inline SVG to avoid dependency on Icons.tsx missing icons) ──
function CategoryIcon({ name, color }: { name: string; color: string }) {
  const s = 18;
  const svgProps = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "cart":
      return <svg {...svgProps}><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /><path d="M4 5h2l2.2 9h8.9l2-7H7.1" /></svg>;
    case "swap":
      return <svg {...svgProps}><path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 14-3 3 3 3" /></svg>;
    case "phone":
      return <svg {...svgProps}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 5.5h3" /></svg>;
    case "spark":
      return <svg {...svgProps}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M4.9 4.9l2.8 2.8" /><path d="M16.3 16.3l2.8 2.8" /><path d="M3 12h4" /><path d="M17 12h4" /></svg>;
    case "shield":
      return <svg {...svgProps}><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /></svg>;
    default:
      return <svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  }
}

// ── Circular progress (CSS conic-gradient) ──
function CircularProgress({ spent, budget, size = 180 }: { spent: number; budget: number; size?: number }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const remainder = 100 - pct;
  const fgColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
  const trackColor = "rgba(255,255,255,0.06)";

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", position: "relative",
      background: `conic-gradient(${fgColor} ${pct}%, ${trackColor} ${pct}%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: size - 16, height: size - 16, borderRadius: "50%",
        background: "#0a1628", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1 }}>
          Dépensé
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, color: fgColor, fontFamily: "'Montserrat',sans-serif" }}>
          {pct.toFixed(0)}%
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          {formatCurrency(spent)} / {formatCurrency(budget)}
        </span>
      </div>
    </div>
  );
}

// ── Donut chart (CSS only) ──
function DonutChart({ categories, totalBudget }: { categories: BudgetCategory[]; totalBudget: number }) {
  const filtered = categories.filter(c => c.allocated > 0);
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600 }}>
        Aucune catégorie allouée
      </div>
    );
  }

  const segments: { color: string; startPct: number; endPct: number; cat: BudgetCategory }[] = [];
  let cumPct = 0;
  for (const cat of filtered) {
    const pct = totalBudget > 0 ? (cat.allocated / totalBudget) * 100 : 0;
    segments.push({ color: cat.color, startPct: cumPct, endPct: cumPct + pct, cat });
    cumPct += pct;
  }

  const conicStops = segments.map(s => `${s.color} ${s.startPct}% ${s.endPct}%`).join(", ");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 140, height: 140, borderRadius: "50%", position: "relative",
        background: `conic-gradient(${conicStops})`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 90, height: 90, borderRadius: "50%", background: "#0a1628",
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
        }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Répartition</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#D4A437", fontFamily: "'Montserrat',sans-serif" }}>
            {filtered.length}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {segments.map(s => (
          <div key={s.cat.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>{s.cat.name}</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              {((s.endPct - s.startPct)).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress bar with color coding ──
function CategoryProgressBar({ allocated, spent }: { allocated: number; spent: number }) {
  const pct = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
  const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{
      width: "100%", height: 6, borderRadius: 3,
      background: "rgba(255,255,255,0.06)", overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 3,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ── Alert Banner ──
function AlertBanner({ type, message }: { type: "warning" | "danger" | "info"; message: string }) {
  const bg = type === "danger"
    ? "rgba(239,68,68,0.1)"
    : type === "warning"
      ? "rgba(245,158,11,0.1)"
      : "rgba(59,130,246,0.1)";
  const border = type === "danger"
    ? "rgba(239,68,68,0.35)"
    : type === "warning"
      ? "rgba(245,158,11,0.35)"
      : "rgba(59,130,246,0.35)";
  const iconColor = type === "danger" ? "#ef4444" : type === "warning" ? "#f59e0b" : "#3b82f6";
  const icon = type === "danger" ? "⚠" : type === "warning" ? "⚡" : "ℹ";

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 12,
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", flex: 1 }}>
        {message}
      </span>
    </div>
  );
}

// ── Main Component ──
export default function BudgetView({ authUid, firestoreBalance, onBack, showToast, getAuthHeaders }: BudgetViewProps) {
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSetBudget, setShowSetBudget] = useState(false);

  // Set budget form state
  const [formTotal, setFormTotal] = useState("");
  const [formCategories, setFormCategories] = useState<BudgetCategory[]>(DEFAULT_CATEGORIES);
  const [formMtn, setFormMtn] = useState("300000");
  const [formAirtel, setFormAirtel] = useState("200000");

  const fetchBudget = useCallback(async () => {
    if (!authUid) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/budget", { headers });
      const data = await res.json();
      if (data.success && data.budget) {
        setBudget(data.budget as MonthlyBudget);
      } else {
        setBudget(null);
      }
    } catch {
      showToast("Erreur de chargement du budget");
    } finally {
      setLoading(false);
    }
  }, [authUid, getAuthHeaders, showToast]);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  // Check if MTN/Airtel limits exceeded
  const mtnSpent = budget?.categories.find(c => c.id === "communication")?.spent ?? 0;
  const airtelSpent = budget?.categories.find(c => c.id === "communication")?.spent ?? 0;
  const mtnLimit = budget?.mtnLimit ?? 300000;
  const airtelLimit = budget?.airtelLimit ?? 200000;

  const totalSpent = budget?.totalSpent ?? 0;
  const totalBudget = budget?.totalBudget ?? 0;
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Open set-budget with current data
  const openSetBudget = () => {
    if (budget) {
      setFormTotal(String(budget.totalBudget));
      setFormCategories(budget.categories.map(c => ({ ...c })));
      setFormMtn(String(budget.mtnLimit));
      setFormAirtel(String(budget.airtelLimit));
    } else {
      setFormTotal("");
      setFormCategories(DEFAULT_CATEGORIES.map(c => ({ ...c })));
      setFormMtn("300000");
      setFormAirtel("200000");
    }
    setShowSetBudget(true);
  };

  const updateCategoryAllocation = (idx: number, value: string) => {
    const num = Number(value.replace(/[^0-9]/g, "")) || 0;
    const updated = [...formCategories];
    updated[idx] = { ...updated[idx], allocated: num };
    setFormCategories(updated);
  };

  const totalAllocated = formCategories.reduce((s, c) => s + c.allocated, 0);

  const handleSaveBudget = async () => {
    const total = Number(formTotal.replace(/[^0-9]/g, "")) || 0;
    if (total <= 0) { showToast("Le budget total doit être supérieur à 0"); return; }
    if (totalAllocated > total) { showToast("L'allocation totale dépasse le budget"); return; }

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/budget", {
        method: "POST",
        headers,
        body: JSON.stringify({
          totalBudget: total,
          categories: formCategories,
          mtnLimit: Number(formMtn) || 300000,
          airtelLimit: Number(formAirtel) || 200000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Budget enregistré avec succès ✓");
        setShowSetBudget(false);
        fetchBudget();
      } else {
        showToast(data.error || "Erreur");
      }
    } catch {
      showToast("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  // ── Set Budget Modal ──
  if (showSetBudget) {
    return (
      <div style={{
        background: "#050b1a", color: "#fff",
        fontFamily: "'Inter','Segoe UI',sans-serif", padding: 16,
        paddingBottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSetBudget(false)} style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>
            ←
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Définir le Budget</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
              {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* Total budget */}
        <div style={{
          background: "linear-gradient(135deg, rgba(212,164,55,0.12), rgba(26,62,120,0.15))",
          border: "1px solid rgba(212,164,55,0.2)", borderRadius: 16,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Budget Total
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>FCFA</span>
            <input
              type="text"
              inputMode="numeric"
              value={formTotal}
              onChange={e => setFormTotal(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              style={{
                flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, padding: "10px 14px", fontSize: 20, fontWeight: 800,
                color: "#D4A437", outline: "none", fontFamily: "'Montserrat',sans-serif",
              }}
            />
          </div>
          {Number(formTotal) > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: totalAllocated > Number(formTotal) ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
              Alloué: {formatCurrency(totalAllocated)} / {formatCurrency(Number(formTotal))}
              {totalAllocated > Number(formTotal) && " — Dépassement!"}
            </div>
          )}
        </div>

        {/* Category allocations */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
          Répartition par catégorie
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {formCategories.map((cat, idx) => (
            <div key={cat.id} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${cat.color}15`, border: `1px solid ${cat.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CategoryIcon name={cat.icon} color={cat.color} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{cat.name}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>FCFA</span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={cat.allocated > 0 ? String(cat.allocated) : ""}
                onChange={e => updateCategoryAllocation(idx, e.target.value)}
                placeholder="0"
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
                  padding: "8px 12px", fontSize: 15, fontWeight: 700,
                  color: "#fff", outline: "none", fontFamily: "'Montserrat',sans-serif",
                }}
              />
            </div>
          ))}
        </div>

        {/* Operator limits */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
          Limites opérateur
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <div style={{
            flex: 1, background: "rgba(255,220,0,0.06)", border: "1px solid rgba(255,220,0,0.15)",
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FFCC00", marginBottom: 6 }}>MTN Congo</div>
            <input
              type="text"
              inputMode="numeric"
              value={formMtn}
              onChange={e => setFormMtn(e.target.value.replace(/[^0-9]/g, ""))}
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700,
                color: "#FFCC00", outline: "none", fontFamily: "'Montserrat',sans-serif",
              }}
            />
          </div>
          <div style={{
            flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Airtel Congo</div>
            <input
              type="text"
              inputMode="numeric"
              value={formAirtel}
              onChange={e => setFormAirtel(e.target.value.replace(/[^0-9]/g, ""))}
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700,
                color: "#ef4444", outline: "none", fontFamily: "'Montserrat',sans-serif",
              }}
            />
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveBudget}
          disabled={saving}
          style={{
            width: "100%", padding: 16, borderRadius: 14, border: "none",
            background: saving
              ? "rgba(212,164,55,0.3)"
              : "linear-gradient(135deg, #D4A437, #1A3E78)",
            color: "#fff", fontSize: 15, fontWeight: 800, cursor: saving ? "default" : "pointer",
            fontFamily: "'Montserrat',sans-serif", letterSpacing: 0.5,
          }}
        >
          {saving ? "Enregistrement..." : "Enregistrer le Budget"}
        </button>
      </div>
    );
  }

  // ── Main Budget View ──
  return (
    <div style={{
      background: "#050b1a", color: "#fff",
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: 16,
      paddingBottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Budget Mensuel</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
        </div>
        <button onClick={openSetBudget} style={{
          padding: "8px 16px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(212,164,55,0.15), rgba(26,62,120,0.2))",
          border: "1px solid rgba(212,164,55,0.3)", color: "#D4A437",
          fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          {budget ? "Modifier" : "Définir"}
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
          <div style={{
            width: 28, height: 28, border: "3px solid rgba(212,164,55,0.3)",
            borderTopColor: "#D4A437", borderRadius: "50%",
            animation: "spin .7s linear infinite",
          }} />
        </div>
      ) : !budget ? (
        /* Empty state */
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{
            width: 72, height: 72, margin: "0 auto 16px", borderRadius: 20,
            background: "linear-gradient(135deg, rgba(212,164,55,0.12), rgba(26,62,120,0.15))",
            border: "1px solid rgba(212,164,55,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="7" rx="5" ry="2.5" /><path d="M7 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
              <path d="M9 14.5v2c0 1.1 1.8 2 4 2s4-.9 4-2v-2" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
            Aucun budget défini
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 20, lineHeight: 1.6 }}>
            Définissez votre budget mensuel pour suivre vos dépenses par catégorie.
          </div>
          <button onClick={openSetBudget} style={{
            padding: "12px 28px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #D4A437, #1A3E78)",
            color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
            fontFamily: "'Montserrat',sans-serif",
          }}>
            Créer un budget
          </button>
        </div>
      ) : (
        <>
          {/* Alerts */}
          {budget.alertsEnabled && (
            <>
              {totalPct > 90 && (
                <AlertBanner type="danger" message={`Budget presque épuisé! ${totalPct.toFixed(0)}% utilisé.`} />
              )}
              {totalPct > 70 && totalPct <= 90 && (
                <AlertBanner type="warning" message={`Vous avez utilisé ${totalPct.toFixed(0)}% de votre budget.`} />
              )}
              {mtnSpent > mtnLimit * 0.9 && (
                <AlertBanner type="warning" message={`Limite MTN Congo: ${formatCurrency(mtnSpent)} / ${formatCurrency(mtnLimit)} FCFA`} />
              )}
              {airtelSpent > airtelLimit * 0.9 && (
                <AlertBanner type="warning" message={`Limite Airtel Congo: ${formatCurrency(airtelSpent)} / ${formatCurrency(airtelLimit)} FCFA`} />
              )}
            </>
          )}

          {/* Circular progress */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <CircularProgress spent={budget.totalSpent} budget={budget.totalBudget} />
          </div>

          {/* Balance info */}
          <div style={{
            display: "flex", gap: 10, marginBottom: 20,
          }}>
            <div style={{
              flex: 1, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
              borderRadius: 12, padding: 14, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(34,197,94,0.7)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Restant
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", fontFamily: "'Montserrat',sans-serif", marginTop: 4 }}>
                {formatCurrency(Math.max(0, budget.totalBudget - budget.totalSpent))}
              </div>
            </div>
            <div style={{
              flex: 1, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
              borderRadius: 12, padding: 14, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(59,130,246,0.7)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Solde Compte
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa", fontFamily: "'Montserrat',sans-serif", marginTop: 4 }}>
                {formatCurrency(firestoreBalance)}
              </div>
            </div>
          </div>

          {/* Donut chart */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 16, textAlign: "center" }}>
              Répartition du Budget
            </div>
            <DonutChart categories={budget.categories} totalBudget={budget.totalBudget} />
          </div>

          {/* Category breakdown */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
            Dépenses par catégorie
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {budget.categories.map(cat => {
              const pct = cat.allocated > 0 ? (cat.spent / cat.allocated) * 100 : 0;
              const statusColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
              return (
                <div key={cat.id} style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `${cat.color}15`, border: `1px solid ${cat.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <CategoryIcon name={cat.icon} color={cat.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{cat.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                          {formatCurrency(cat.spent)} / {formatCurrency(cat.allocated)}
                        </span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                          Reste: {formatCurrency(Math.max(0, cat.allocated - cat.spent))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <CategoryProgressBar allocated={cat.allocated} spent={cat.spent} />
                </div>
              );
            })}
          </div>

          {/* Operator limits */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
            Limites Opérateur
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{
              flex: 1, background: "rgba(255,220,0,0.05)", border: "1px solid rgba(255,220,0,0.12)",
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: "#FFCC00" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FFCC00" }}>MTN Congo</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                {formatCurrency(mtnSpent)} <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>/ {formatCurrency(mtnLimit)}</span>
              </div>
              <div style={{
                width: "100%", height: 5, borderRadius: 3,
                background: "rgba(255,255,255,0.06)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min((mtnSpent / mtnLimit) * 100, 100)}%`, height: "100%",
                  borderRadius: 3, background: mtnSpent > mtnLimit * 0.9 ? "#ef4444" : "#FFCC00",
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
            <div style={{
              flex: 1, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)",
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>Airtel Congo</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                {formatCurrency(airtelSpent)} <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>/ {formatCurrency(airtelLimit)}</span>
              </div>
              <div style={{
                width: "100%", height: 5, borderRadius: 3,
                background: "rgba(255,255,255,0.06)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min((airtelSpent / airtelLimit) * 100, 100)}%`, height: "100%",
                  borderRadius: 3, background: airtelSpent > airtelLimit * 0.9 ? "#ef4444" : "#f97316",
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
