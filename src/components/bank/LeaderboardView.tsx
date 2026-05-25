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

// ── Mock data fallback ──
const MOCK_ENTRIES: LeaderboardApiResponse[] = [
  { uid: "m1", name: "Jean Mbeki", avatar: "", score: 4200, level: 7, levelTitle: "Maître", nextScore: 4000, badge: "crown", streak: 14, transactionCount: 156, goalsReached: 8, savingsTotal: 2500000, rank: 1, isCurrentUser: false },
  { uid: "m2", name: "Marie Ngoie", avatar: "", score: 3800, level: 6, levelTitle: "Expert", nextScore: 4000, badge: "star", streak: 21, transactionCount: 132, goalsReached: 6, savingsTotal: 1800000, rank: 2, isCurrentUser: false },
  { uid: "m3", name: "Patrick Lokela", avatar: "", score: 3200, level: 6, levelTitle: "Expert", nextScore: 4000, badge: "trophy", streak: 10, transactionCount: 98, goalsReached: 5, savingsTotal: 1400000, rank: 3, isCurrentUser: false },
  { uid: "m4", name: "Fatou Diallo", avatar: "", score: 2700, level: 5, levelTitle: "Avancé", nextScore: 2500, badge: "gift", streak: 7, transactionCount: 87, goalsReached: 4, savingsTotal: 1100000, rank: 4, isCurrentUser: false },
  { uid: "m5", name: "Ibrahim Bemba", avatar: "", score: 2100, level: 5, levelTitle: "Avancé", nextScore: 2500, badge: "", streak: 5, transactionCount: 72, goalsReached: 3, savingsTotal: 800000, rank: 5, isCurrentUser: false },
  { uid: "m6", name: "Céline Massamba", avatar: "", score: 1800, level: 4, levelTitle: "Intermédiaire", nextScore: 2500, badge: "", streak: 3, transactionCount: 63, goalsReached: 2, savingsTotal: 650000, rank: 6, isCurrentUser: false },
  { uid: "m7", name: "Serge Makaya", avatar: "", score: 1200, level: 4, levelTitle: "Intermédiaire", nextScore: 2500, badge: "", streak: 2, transactionCount: 45, goalsReached: 2, savingsTotal: 400000, rank: 7, isCurrentUser: false },
  { uid: "m8", name: "Grace Okombi", avatar: "", score: 850, level: 3, levelTitle: "Apprenti", nextScore: 1000, badge: "", streak: 1, transactionCount: 32, goalsReached: 1, savingsTotal: 250000, rank: 8, isCurrentUser: false },
];

const MOCK_ACHIEVEMENTS: UserAchievement[] = [
  { id: "first_saving", name: "Premier Épargne", description: "Effectuez votre premier dépôt d'épargne", icon: "piggy", progress: 100, unlockedAt: "2025-01-15" },
  { id: "ten_transactions", name: "10 Transactions", description: "Effectuez 10 transactions", icon: "receipt", progress: 100, unlockedAt: "2025-01-20" },
  { id: "goal_reached", name: "Objectif Atteint", description: "Atteignez un objectif d'épargne", icon: "target", progress: 60 },
  { id: "tontine_master", name: "Tontine Master", description: "Participez à 3 tontines actives", icon: "users", progress: 33 },
  { id: "budget_pro", name: "Budget Pro", description: "Respectez votre budget 3 mois consécutifs", icon: "chart", progress: 0 },
  { id: "streak_7", name: "Série de 7 jours", description: "Connectez-vous 7 jours consécutifs", icon: "trending-up", progress: 100, unlockedAt: "2025-02-01" },
  { id: "social_star", name: "Étoile Sociale", description: "Invitez 5 amis sur MOARLI", icon: "star", progress: 20 },
  { id: "crypto_explorer", name: "Explorateur Crypto", description: "Effectuez votre premier achat crypto", icon: "crypto", progress: 0 },
];

const MOCK_CHALLENGES: Challenge[] = [
  { id: "c1", title: "Marathon d'Épargne", description: "Économisez 500 000 FCFA ce mois-ci", reward: 500, participants: 234, progress: 45, endDate: "2025-02-28" },
  { id: "c2", title: "Défi 30 Transactions", description: "Effectuez 30 transactions en 30 jours", reward: 300, participants: 156, progress: 60, endDate: "2025-02-28" },
  { id: "c3", title: "Invitation Champion", description: "Invitez 3 nouveaux utilisateurs", reward: 200, participants: 89, progress: 33, endDate: "2025-03-15" },
];

// ── Achievement icon SVGs ──
function AchievementIcon({ name, size = 20, unlocked }: { name: string; size?: number; unlocked?: boolean }) {
  const s = size;
  const color = unlocked ? "#D4A437" : "rgba(255,255,255,0.25)";
  const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "piggy":
      return <svg {...p}><path d="M7 10a6 6 0 0 1 6-4 7 7 0 0 1 5 2l2 1v4l-2 1v2h-2l-1-2H9l-1 2H6v-2l-2-1v-2a4 4 0 0 1 3-4Z" /><path d="M13 10h.01" /></svg>;
    case "receipt":
      return <svg {...p}><path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6" /><path d="M9 12h6" /></svg>;
    case "target":
      return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
    case "users":
      return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="8" r="3" /><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6" /></svg>;
    case "chart":
      return <svg {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>;
    case "trending-up":
      return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case "star":
      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case "crypto":
      return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M9 9.5h4a2 2 0 0 1 0 4H9.5" /><path d="M10.5 7.5v9" /></svg>;
    case "trophy":
      return <svg {...p}><path d="M6 9H4a2 2 0 0 1-2-2V5h4" /><path d="M18 9h2a2 2 0 0 0 2-2V5h-4" /><path d="M6 5h12v7a6 6 0 0 1-12 0V5Z" /><path d="M12 18v3" /><path d="M8 21h8" /></svg>;
    case "crown":
      return <svg {...p}><path d="M2 17l3-9 5 4 2-8 2 8 5-4 3 9H2z" /><path d="M2 17h20v2H2z" /></svg>;
    case "gift":
      return <svg {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

// ── Podium display for top 3 ──
function Podium({ entries }: { entries: LeaderboardApiResponse[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length < 3) return null;

  // Reorder: 2nd, 1st, 3rd (center = 1st)
  const ordered = [top3[1], top3[0], top3[2]];

  const medals = [
    { emoji: "🥈", bg: "linear-gradient(180deg, rgba(192,192,192,0.15), rgba(192,192,192,0.03))", border: "rgba(192,192,192,0.3)", height: 90 },
    { emoji: "🥇", bg: "linear-gradient(180deg, rgba(212,164,55,0.2), rgba(212,164,55,0.03))", border: "rgba(212,164,55,0.4)", height: 120 },
    { emoji: "🥉", bg: "linear-gradient(180deg, rgba(205,127,50,0.15), rgba(205,127,50,0.03))", border: "rgba(205,127,50,0.3)", height: 70 },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      gap: 8, padding: "20px 8px 0", marginBottom: 20,
    }}>
      {ordered.map((entry, idx) => (
        <div key={entry.uid} style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          width: "32%", maxWidth: 120,
        }}>
          {/* Avatar / Initials */}
          <div style={{
            width: idx === 1 ? 52 : 42, height: idx === 1 ? 52 : 42,
            borderRadius: "50%",
            background: entry.isCurrentUser
              ? "linear-gradient(135deg, #3b82f6, #1A3E78)"
              : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
            border: `2px solid ${medals[idx].border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 6, fontSize: idx === 1 ? 18 : 15,
            fontWeight: 800, color: "rgba(255,255,255,0.7)",
            fontFamily: "'Montserrat',sans-serif",
          }}>
            {entry.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>

          {/* Name */}
          <div style={{
            fontSize: idx === 1 ? 11 : 10, fontWeight: 700,
            color: entry.isCurrentUser ? "#60a5fa" : "rgba(255,255,255,0.7)",
            textAlign: "center", marginBottom: 4, lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {entry.name}
          </div>

          {/* Score */}
          <div style={{
            fontSize: idx === 1 ? 13 : 11, fontWeight: 800,
            color: idx === 1 ? "#D4A437" : "rgba(255,255,255,0.5)",
            fontFamily: "'Montserrat',sans-serif", marginBottom: 6,
          }}>
            {formatCurrency(entry.score)} pts
          </div>

          {/* Podium bar */}
          <div style={{
            width: "100%", height: medals[idx].height, borderRadius: "10px 10px 0 0",
            background: medals[idx].bg, border: `1px solid ${medals[idx].border}`,
            borderBottom: "none",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: 10, fontSize: 22,
          }}>
            {medals[idx].emoji}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Rank badge ──
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return null;
  const bg = "rgba(255,255,255,0.06)";
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 8, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)",
      fontFamily: "'Montserrat',sans-serif", flexShrink: 0,
    }}>
      {rank}
    </div>
  );
}

// ── Main Component ──
export default function LeaderboardView({ authUid, onBack, showToast, getAuthHeaders }: LeaderboardViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("epargne");
  const [entries, setEntries] = useState<LeaderboardApiResponse[]>(MOCK_ENTRIES);
  const [achievements, setAchievements] = useState<UserAchievement[]>(MOCK_ACHIEVEMENTS);
  const [challenges, setChallenges] = useState<Challenge[]>(MOCK_CHALLENGES);
  const [loading, setLoading] = useState(true);
  const [userEntry, setUserEntry] = useState<LeaderboardApiResponse | null>(null);

  const fetchData = useCallback(async () => {
    if (!authUid) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/leaderboard?tab=${activeTab}`, { headers });
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries?.length ? data.entries : MOCK_ENTRIES);
        setAchievements(data.achievements?.length ? data.achievements : MOCK_ACHIEVEMENTS);
        setChallenges(data.challenges?.length ? data.challenges : MOCK_CHALLENGES);
        const me = (data.entries || []).find((e: LeaderboardApiResponse) => e.isCurrentUser);
        if (me) setUserEntry(me);
      }
    } catch {
      // Keep mock data
    } finally {
      setLoading(false);
    }
  }, [authUid, activeTab, getAuthHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Find user rank in full list
  const userRank = userEntry?.rank ?? entries.findIndex(e => e.isCurrentUser) + 1;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "epargne", label: "Épargne" },
    { key: "transactions", label: "Transactions" },
    { key: "objectifs", label: "Objectifs" },
  ];

  const getTabValue = (entry: LeaderboardApiResponse) => {
    switch (activeTab) {
      case "epargne": return entry.savingsTotal;
      case "transactions": return entry.transactionCount;
      case "objectifs": return entry.goalsReached;
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "epargne": return "FCFA épargnés";
      case "transactions": return "transactions";
      case "objectifs": return "objectifs atteints";
    }
  };

  const getTabIcon = () => {
    switch (activeTab) {
      case "epargne": return "🏦";
      case "transactions": return "💳";
      case "objectifs": return "🎯";
    }
  };

  return (
    <div style={{
      background: "#050b1a", color: "#fff",
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: 16,
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
          {getTabIcon()} Classement
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
                    🔥 {userEntry.streak} jours
                  </span>
                </div>
              </div>
              {/* Level progress */}
              <div style={{ textAlign: "right" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  border: `2px solid rgba(59,130,246,0.4)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", position: "relative",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa" }}>{userEntry.level}</span>
                </div>
              </div>
            </div>
          )}

          {/* Podium */}
          {entries.length >= 3 && <Podium entries={entries} />}

          {/* Leaderboard list */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
            Top {getTabIcon()} {getTabLabel()}
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
                  {/* Rank */}
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
                    <RankBadge rank={entry.rank} />
                  )}

                  {/* Avatar */}
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

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: isMe ? "#60a5fa" : "rgba(255,255,255,0.8)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {entry.name}
                      </span>
                      {entry.streak >= 7 && (
                        <span style={{ fontSize: 11 }}>🔥</span>
                      )}
                      {entry.badge && (
                        <span style={{ fontSize: 11 }}>
                          {entry.badge === "crown" ? "👑" : entry.badge === "star" ? "⭐" : entry.badge === "trophy" ? "🏆" : "🎁"}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                        Niv. {entry.level} · {entry.levelTitle}
                      </span>
                    </div>
                  </div>

                  {/* Value */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: isMe ? "#D4A437" : "rgba(255,255,255,0.65)",
                      fontFamily: "'Montserrat',sans-serif",
                    }}>
                      {activeTab === "epargne" ? `${formatCurrency(value)} ` : value}
                      {activeTab === "epargne" ? "FCFA" : activeTab === "transactions" ? "" : ""}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                      {formatCurrency(entry.score)} pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Achievements */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
            🏅 Badges & Succès
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
                    }}>
                      <AchievementIcon name={ach.icon} size={18} unlocked={unlocked} />
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

          {/* Challenges */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
            🎯 Défis Actifs
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

                {/* Progress bar */}
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

          {/* Level system info */}
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
