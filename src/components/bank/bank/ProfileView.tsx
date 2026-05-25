'use client';
import React from "react";
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
              <div className="profile-id">ID: {bankingId}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, padding: "4px 12px", borderRadius: 999, background: kycConfig.bg, border: `1px solid ${kycConfig.border}` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: kycConfig.color }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: kycConfig.color, letterSpacing: ".5px" }}>{kycConfig.text}</span>
              </div>
            </div>
          </div>

          {profileGroups.map((group) => (
            <div key={group.title} className="profile-group">
              <p className="tab-kicker">{group.title}</p>
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
