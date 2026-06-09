'use client';
import React, { useState } from "react";
import { AppIcon } from "@/components/bank/Icons";
import type { IconName } from "@/types/morali";

export interface KycConfig {
  color: string;
  text: string;
  bg: string;
  border: string;
}

export interface ProfileGroupItem {
  icon: IconName;
  label: string;
  sub?: string;
  badge?: string;
}

export interface ProfileGroup {
  title: string;
  items: ProfileGroupItem[];
}

export interface ProfileViewProps {
  holder: string;
  bankingId: string;
  kycConfig: KycConfig;
  kycLevel: number;
  secLevelCount: number;
  profileGroups: ProfileGroup[];
  onAction: (label: string) => void;
  onLogout: () => void;
}

export default function ProfileView({
  holder,
  bankingId,
  kycConfig,
  kycLevel,
  secLevelCount,
  profileGroups,
  onAction,
  onLogout,
}: ProfileViewProps) {
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(bankingId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      // Fallback: select and copy
      const ta = document.createElement("textarea");
      ta.value = bankingId;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  return (
    <div className="app-screen active">
      <div className="content-scrollable nav-safe">
        <div className="profile-screen">
          <div className="profile-top">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-ring" style={{ background: kycConfig.color }}>
                <div className="profile-avatar-core">
                  <AppIcon name="user" size={34} stroke="#fff" />
                </div>
              </div>
              <div className="profile-kyc" style={{ background: kycConfig.color }} title={kycConfig.text}>{kycLevel === 3 ? "✓" : kycLevel === 2 ? "~" : "!"}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="profile-name">{holder}</div>
              <div className="profile-id" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                ID: {bankingId}
                <button
                  onClick={handleCopyId}
                  aria-label="Copier ID"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, borderRadius: 4, border: "none", padding: 0,
                    background: "transparent", cursor: "pointer", opacity: 0.4, flexShrink: 0,
                  }}
                >
                  {copiedId ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                </button>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, padding: "4px 12px", borderRadius: 999, background: kycConfig.bg, border: `1px solid ${kycConfig.border}` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: kycConfig.color }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: kycConfig.color, letterSpacing: ".5px" }}>{kycConfig.text}</span>
              </div>
            </div>
          </div>

          {profileGroups.map((group) => (
            <div key={group.title} className="profile-group">
              <p className="tab-kicker gold-text">{group.title}</p>
              {group.items.map((item) => (
                <button key={item.label} className="profile-item" onClick={() => onAction(item.label)}>
                  <div className="profile-item-left">
                    <div className="tab-card-icon" style={{ background: "rgba(255,255,255,.03)", color: "#cbd5e1" }}>
                      <AppIcon name={item.icon} size={18} stroke={item.icon === "shield" ? "#60a5fa" : "#cbd5e1"} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div className="profile-item-label">{item.label}</div>
                      {item.sub && <div className="profile-item-sub">{item.sub}</div>}
                    </div>
                  </div>
                  {item.label === "Sécurité & Biométrie" ? (
                    <span className="profile-badge" style={{ background: secLevelCount >= 3 ? "rgba(34,197,94,.12)" : secLevelCount >= 2 ? "rgba(234,179,8,.12)" : "rgba(239,68,68,.12)", color: secLevelCount >= 3 ? "#22c55e" : secLevelCount >= 2 ? "#eab308" : "#ef4444" }}>{secLevelCount >= 3 ? "Sécurisé" : secLevelCount >= 2 ? "Moyen" : "Faible"}</span>
                  ) : item.badge ? (
                    <span className="profile-badge">{item.badge}</span>
                  ) : (
                    <AppIcon name="chevronRight" size={16} stroke="#334155" />
                  )}
                </button>
              ))}
            </div>
          ))}

          <button className="profile-logout" onClick={onLogout}>
            Se déconnecter
          </button>

          <p className="profile-version">MORALI PAY v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
