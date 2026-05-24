'use client';
import React, { useState, useEffect, useCallback } from "react";
import type { LeaderboardEntry, UserAchievement } from "@/types/morali";
import { formatCurrency } from "@/lib/helpers";

// ── Props ──
interface LeaderboardViewProps {
  authUid: string | null;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

// ── Types ──
interface LeaderboardApiResponse {
  uid: string;
  name: string;
  avatar: string;
  score: number;
  level: number;
  levelTitle: string;
  nextScore: number;
  badge: string;
  streak: number;
  transactionCount: number;
  goalsReached: number;
  savingsTotal: number;
  rank: number;
  isCurrentUser: boolean;
}

interface Challenge {
  id: string;
  title?: string;
  description?: string;
  reward?: number;
  endDate?: string;
  participants?: number;
  progress?: number;
}

type TabKey = "epargne" | "transactions" | "objectifs";

// ── NO mock data — starts empty ──
const EMPTY_ENTRIES: LeaderboardApiResponse[] = [];
const EMPTY_ACHIEVEMENTS: UserAchievement[] = [];
const EMPTY_CHALLENGES: Challenge[] = [];

// ── Empty state component ──
function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, { title: string; desc: string }> = {
    epargne: { title: "Aucun classement d'épargne", desc: "Commencez à épargner pour apparaître dans le classement de la communauté." },
    transactions: { title: "Aucun classement de transactions", desc: "Effectuez des transactions pour grimper dans le classement." },
    objectifs: { title: "Aucun classement d'objectifs", desc: "Atteignez vos premiers objectifs d'épargne pour apparaître ici." },
  };
  const msg = messages[tab];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
          <path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
          <path d="M6 5h12v7a6 6 0 0 1-12 0V5Z" />
          <path d="M12 18v3" />
          <path d="M8 21h8" />
        </svg>
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 6,
      }}>
        {msg.title}
      </div>
      <div style={{
        fontSize: 12,
        color: "rgba(255,255,255,0.25)",
        lineHeight: 1.5,
        maxWidth: 260,
      }}>
        {msg.desc}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function LeaderboardView({ authUid, onBack, showToast, getAuthHeaders }: LeaderboardViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("epargne");
  const [entries, setEntries] = useState<LeaderboardApiResponse[]>(EMPTY_ENTRIES);
  const [achievements, setAchievements] = useState<UserAchievement[]>(EMPTY_ACHIEVEMENTS);
  const [challenges, setChallenges] = useState<Challenge[]>(EMPTY_CHALLENGES);
  const [loading, setLoading] = useState(true);
  const [userEntry, setUserEntry] = useState<LeaderboardApiResponse | null>(null);

  const fetchData = useCallback(async () => {
    if (!authUid) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/leaderboard?tab=${activeTab}`, { headers });
      const data = await res.json();
      if (data.success) {
        // Only use real data from API — no mock fallback
        setEntries(data.entries || EMPTY_ENTRIES);
        setAchievements(data.achievements || EMPTY_ACHIEVEMENTS);
        setChallenges(data.challenges || EMPTY_CHALLENGES);
        const me = (data.entries || []).find((e: LeaderboardApiResponse) => e.isCurrentUser);
        if (me) setUserEntry(me);
      }
    } catch {
      // Keep empty
    } finally {
      setLoading(false);
    }
  }, [authUid, activeTab, getAuthHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const userRank = userEntry?.rank ?? 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "epargne", label: "Épargne" },
    { key: "transactions", label: "Transactions" },
    { key: "objectifs", label: "Objectifs" },
  ];

  const getTabLabel = () => {
    switch (activeTab) {
      case "epargne": return "FCFA épargnés";
      case "transactions": return "transactions";
      case "objectifs": return "objectifs atteints";
    }
  };

  const getTabValue = (entry: LeaderboardApiResponse) => {
    switch (activeTab) {
      case "epargne": return entry.savingsTotal;
      case "transactions": return entry.transactionCount;
      case "objectifs": return entry.goalsReached;
    }
  };

  return (
    <div style={{
      height: "100%", background: "#050b1a", color: "#fff",
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: 16,
      paddingBottom: 180,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      scrollbarWidth: "none",
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>Classement</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            Comparez avec la communauté
          </div>
        </div>
        <div style={{
          padding: "4px 12px", borderRadius: 8,
          background: "rgba(212,164,55,0.1)", border: "1px solid rgba(212,164,55,0.25)",
          fontSize: 11, fontWeight: 700, color: "#D4A437",
        }}>
          Classement
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
          <div style={{
            width: 28, height: 28, border: "3px solid rgba(212,164,55,0.3)",
            borderTopColor: "#D4A437", borderRadius: "50%",
            animation: "spin .7s linear infinite",
          }} />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{
            display: "flex", gap: 6, marginBottom: 20,
            background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4,
          }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: "10px 8px", borderRadius: 10,
                  background: activeTab === tab.key
                    ? "linear-gradient(135deg, rgba(212,164,55,0.2), rgba(26,62,120,0.2))"
                    : "transparent",
                  color: activeTab === tab.key ? "#D4A437" : "rgba(255,255,255,0.4)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: activeTab === tab.key ? "1px solid rgba(212,164,55,0.3)" : "1px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* User's own rank card */}
          {userEntry && (
            <div style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(26,62,120,0.12))",
              border: "1px solid rgba(59,130,246,0.25)", borderRadius: 14,
              padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #1A3E78)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 800, fontFamily: "'Montserrat',sans-serif",
              }}>
                {userEntry.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{userEntry.name}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                    background: "rgba(212,164,55,0.15)", color: "#D4A437",
                    border: "1px solid rgba(212,164,55,0.25)",
                  }}>
                    Niv. {userEntry.level} · {userEntry.levelTitle}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                    Rang #{userRank}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                    {formatCurrency(userEntry.score)} pts
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                    {userEntry.streak} jours
                  </span>
                </div>
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                border: `2px solid rgba(59,130,246,0.4)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa" }}>{userEntry.level}</span>
              </div>
            </div>
          )}

          {/* Leaderboard list — or empty state */}
          {entries.length > 0 ? (
            <>
              {/* Podium — only if 3+ real users */}
              {entries.length >= 3 && (
                <div style={{
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  gap: 8, padding: "20px 8px 0", marginBottom: 20,
                }}>
                  {[1, 0, 2].map((podiumIdx) => {
                    const entry = entries[podiumIdx];
                    if (!entry) return null;
                    const medals = [
                      { emoji: "🥈", bg: "linear-gradient(180deg, rgba(192,192,192,0.15), rgba(192,192,192,0.03))", border: "rgba(192,192,192,0.3)", height: 90 },
                      { emoji: "🥇", bg: "linear-gradient(180deg, rgba(212,164,55,0.2), rgba(212,164,55,0.03))", border: "rgba(212,164,55,0.4)", height: 120 },
                      { emoji: "🥉", bg: "linear-gradient(180deg, rgba(205,127,50,0.15), rgba(205,127,50,0.03))", border: "rgba(205,127,50,0.3)", height: 70 },
                    ];
                    const m = medals[podiumIdx];
                    return (
                      <div key={entry.uid} style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        width: "32%", maxWidth: 120,
                      }}>
                        <div style={{
                          width: podiumIdx === 1 ? 52 : 42, height: podiumIdx === 1 ? 52 : 42,
                          borderRadius: "50%",
                          background: entry.isCurrentUser
                            ? "linear-gradient(135deg, #3b82f6, #1A3E78)"
                            : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                          border: `2px solid ${m.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          marginBottom: 6, fontSize: podiumIdx === 1 ? 18 : 15,
                          fontWeight: 800, color: "rgba(255,255,255,0.7)",
                          fontFamily: "'Montserrat',sans-serif",
                        }}>
                          {entry.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div style={{
                          fontSize: podiumIdx === 1 ? 11 : 10, fontWeight: 700,
                          color: entry.isCurrentUser ? "#60a5fa" : "rgba(255,255,255,0.7)",
                          textAlign: "center", marginBottom: 4, lineHeight: 1.2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}>
                          {entry.name}
                        </div>
                        <div style={{
                          fontSize: podiumIdx === 1 ? 13 : 11, fontWeight: 800,
                          color: podiumIdx === 1 ? "#D4A437" : "rgba(255,255,255,0.5)",
                          fontFamily: "'Montserrat',sans-serif", marginBottom: 6,
                        }}>
                          {formatCurrency(entry.score)} pts
                        </div>
                        <div style={{
                          width: "100%", height: m.height, borderRadius: "10px 10px 0 0",
                          background: m.bg, border: `1px solid ${m.border}`,
                          borderBottom: "none",
                          display: "flex", alignItems: "flex-start", justifyContent: "center",
                          paddingTop: 10, fontSize: 22,
                        }}>
                          {m.emoji}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* List */}
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
                Top {getTabLabel()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
                {entries.map(entry => {
                  const isMe = entry.isCurrentUser;
                  const value = getTabValue(entry);
                  return (
                    <div key={entry.uid} style={{
                      background: isMe
                        ? "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(26,62,120,0.1))"
                        : "rgba(255,255,255,0.02)",
                      border: isMe
                        ? "1px solid rgba(59,130,246,0.2)"
                        : "1px solid rgba(255,255,255,0.04)",
                      borderRadius: 12, padding: "12px 14px",
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      {entry.rank <= 3 ? (
                        <div style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: entry.rank === 1
                            ? "linear-gradient(135deg, rgba(212,164,55,0.25), rgba(212,164,55,0.05))"
                            : entry.rank === 2
                              ? "linear-gradient(135deg, rgba(192,192,192,0.2), rgba(192,192,192,0.05))"
                              : "linear-gradient(135deg, rgba(205,127,50,0.2), rgba(205,127,50,0.05))",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, flexShrink: 0,
                        }}>
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                        </div>
                      ) : (
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)",
                          fontFamily: "'Montserrat',sans-serif", flexShrink: 0,
                        }}>
                          {entry.rank}
                        </div>
                      )}
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: isMe
                          ? "linear-gradient(135deg, #3b82f6, #1A3E78)"
                          : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.6)",
                        fontFamily: "'Montserrat',sans-serif", flexShrink: 0,
                      }}>
                        {entry.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: isMe ? "#60a5fa" : "rgba(255,255,255,0.8)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          display: "block",
                        }}>
                          {entry.name}
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                          Niv. {entry.level} · {entry.levelTitle}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 800, color: isMe ? "#D4A437" : "rgba(255,255,255,0.65)",
                          fontFamily: "'Montserrat',sans-serif",
                        }}>
                          {activeTab === "epargne" ? `${formatCurrency(value)} ` : value}
                          {activeTab === "epargne" ? "FCFA" : ""}
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                          {formatCurrency(entry.score)} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState tab={activeTab} />
          )}

          {/* Achievements — only show if real data */}
          {achievements.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                Badges & Succès
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 8, marginBottom: 24,
              }}>
                {achievements.map(ach => {
                  const unlocked = !!ach.unlockedAt;
                  return (
                    <div key={ach.id} style={{
                      background: unlocked
                        ? "linear-gradient(135deg, rgba(212,164,55,0.08), rgba(212,164,55,0.02))"
                        : "rgba(255,255,255,0.02)",
                      border: unlocked
                        ? "1px solid rgba(212,164,55,0.2)"
                        : "1px solid rgba(255,255,255,0.04)",
                      borderRadius: 12, padding: 14,
                      opacity: unlocked ? 1 : 0.5,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: unlocked ? "rgba(212,164,55,0.12)" : "rgba(255,255,255,0.04)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16,
                        }}>
                          {unlocked ? "🏅" : "🔒"}
                        </div>
                        {unlocked && (
                          <div style={{
                            fontSize: 9, fontWeight: 700, color: "#22c55e",
                            background: "rgba(34,197,94,0.1)", padding: "2px 6px",
                            borderRadius: 4, border: "1px solid rgba(34,197,94,0.2)",
                          }}>
                            ✓
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: unlocked ? "#D4A437" : "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                        {ach.name}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, lineHeight: 1.3 }}>
                        {ach.description}
                      </div>
                      {!unlocked && (ach.progress ?? 0) > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{
                            width: "100%", height: 4, borderRadius: 2,
                            background: "rgba(255,255,255,0.06)", overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${ach.progress}%`, height: "100%", borderRadius: 2,
                              background: "linear-gradient(90deg, rgba(212,164,55,0.3), #D4A437)",
                            }} />
                          </div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 600, marginTop: 2 }}>
                            {ach.progress}%
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Challenges — only show if real data */}
          {challenges.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                Défis Actifs
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {challenges.map(ch => (
                  <div key={ch.id} style={{
                    background: "linear-gradient(135deg, rgba(212,164,55,0.06), rgba(26,62,120,0.08))",
                    border: "1px solid rgba(212,164,55,0.15)", borderRadius: 12, padding: 16,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>
                          {ch.title ?? "Défi"}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 2 }}>
                          {ch.description ?? ""}
                        </div>
                      </div>
                      <div style={{
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(212,164,55,0.12)", border: "1px solid rgba(212,164,55,0.25)",
                        fontSize: 11, fontWeight: 800, color: "#D4A437",
                        fontFamily: "'Montserrat',sans-serif",
                      }}>
                        +{ch.reward ?? 0} pts
                      </div>
                    </div>
                    <div style={{
                      width: "100%", height: 6, borderRadius: 3,
                      background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6,
                    }}>
                      <div style={{
                        width: `${ch.progress ?? 0}%`, height: "100%", borderRadius: 3,
                        background: "linear-gradient(90deg, rgba(212,164,55,0.4), #D4A437)",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                        {ch.progress ?? 0}% complété
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                        {ch.participants ?? 0} participants
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Level system — always show as reference */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14, padding: 20, marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12, textAlign: "center" }}>
              Système de Niveaux
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { level: 1, title: "Débutant", min: 0, icon: "🌱" },
                { level: 2, title: "Novice", min: 100, icon: "📚" },
                { level: 3, title: "Apprenti", min: 300, icon: "⚡" },
                { level: 4, title: "Intermédiaire", min: 600, icon: "🔧" },
                { level: 5, title: "Avancé", min: 1000, icon: "🚀" },
                { level: 6, title: "Expert", min: 1500, icon: "💎" },
                { level: 7, title: "Maître", min: 2500, icon: "👑" },
                { level: 8, title: "Champion", min: 4000, icon: "🏆" },
                { level: 9, title: "Légende", min: 6000, icon: "🌟" },
              ].map(lvl => {
                const isActive = userEntry && userEntry.level === lvl.level;
                const isPast = userEntry && userEntry.level > lvl.level;
                return (
                  <div key={lvl.level} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 10px", borderRadius: 8,
                    background: isActive ? "rgba(212,164,55,0.08)" : "transparent",
                    border: isActive ? "1px solid rgba(212,164,55,0.2)" : "1px solid transparent",
                    opacity: isPast ? 0.5 : 1,
                  }}>
                    <span style={{ fontSize: 14 }}>{lvl.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#D4A437" : "rgba(255,255,255,0.5)", flex: 1 }}>
                      Niv. {lvl.level} — {lvl.title}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                      {formatCurrency(lvl.min)} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
