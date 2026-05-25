'use client';
import React from "react";
import type { IconName, NavItem } from "@/types/morali";

export function MoraliShield({ small = false }: { small?: boolean }) {
  const width = small ? 20 : 32;
  const height = small ? 24 : 38;
  const stroke = small ? 2.2 : 2;

  return (
    <svg width={width} height={height} viewBox="0 0 40 46" fill="none" aria-hidden="true">
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" fill="#1A3E78" />
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" stroke="#D4A437" strokeWidth={stroke} fill="none" />
      <path d="M11 29V17L20 23L29 17V29" stroke="#D4A437" strokeWidth={small ? 3.2 : 3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11 17L20 23L29 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ArrowRightIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function MoraliMarkIcon({ size = 18, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17V7l7 5 7-5v10" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 7l7 5 7-5" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppIcon({ name, size = 20, stroke = "currentColor" }: { name: IconName; size?: number; stroke?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "morali") return <MoraliMarkIcon size={size} stroke={stroke} />;
  if (name === "send") return <svg {...common}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>;
  if (name === "receive") return <svg {...common}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>;
  if (name === "card") return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></svg>;
  if (name === "grid") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 12h18" /></svg>;
  if (name === "home") return <svg {...common}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V19h11v-8.5" /><path d="M10 19v-4h4v4" /></svg>;
  if (name === "bolt") return <svg {...common}><path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z" /></svg>;
  if (name === "building") return <svg {...common}><path d="M4 20h16" /><path d="M6 20V9l6-4 6 4v11" /><path d="M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01" /></svg>;
  if (name === "phone") return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 5.5h3" /><path d="M11.5 18.5h1" /></svg>;
  if (name === "cart") return <svg {...common}><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /><path d="M4 5h2l2.2 9h8.9l2-7H7.1" /></svg>;
  if (name === "user") return <svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="8" r="4" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M4.9 4.9l2.8 2.8" /><path d="M16.3 16.3l2.8 2.8" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M4.9 19.1l2.8-2.8" /><path d="M16.3 7.7l2.8-2.8" /></svg>;
  if (name === "bank") return <svg {...common}><path d="M3 9 12 4l9 5" /><path d="M5 10v8" /><path d="M9.5 10v8" /><path d="M14.5 10v8" /><path d="M19 10v8" /><path d="M3 20h18" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9.5 12 1.8 1.8 3.7-3.7" /></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" /><path d="M16 12h4" /><circle cx="16" cy="12" r="1" fill={stroke} stroke="none" /></svg>;
  if (name === "service") return <svg {...common}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M4.93 4.93l2.12 2.12" /><path d="M16.95 16.95l2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M4.93 19.07l2.12-2.12" /><path d="M16.95 7.05l2.12-2.12" /></svg>;
  if (name === "transfer") return <svg {...common}><path d="M7 7h11" /><path d="m14 4 4 3-4 3" /><path d="M17 17H6" /><path d="m10 14-4 3 4 3" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "globe") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>;
  if (name === "tv") return <svg {...common}><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M10 18v3" /><path d="M14 18v3" /></svg>;
  if (name === "droplet") return <svg {...common}><path d="M12 3c2.5 3 5 6.2 5 9a5 5 0 1 1-10 0c0-2.8 2.5-6 5-9Z" /></svg>;
  if (name === "qr") return <svg {...common}><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><path d="M15 15h2v2h-2z" /><path d="M19 15v5" /><path d="M15 19h5" /></svg>;
  if (name === "piggy") return <svg {...common}><path d="M7 10a6 6 0 0 1 6-4 7 7 0 0 1 5 2l2 1v4l-2 1v2h-2l-1-2H9l-1 2H6v-2l-2-1v-2a4 4 0 0 1 3-4Z" /><path d="M13 10h.01" /><path d="M15.5 7.5h1.5" /></svg>;
  if (name === "coins") return <svg {...common}><ellipse cx="12" cy="7" rx="5" ry="2.5" /><path d="M7 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" /><path d="M9 14.5v2c0 1.1 1.8 2 4 2s4-.9 4-2v-2" /></svg>;
  if (name === "swap") return <svg {...common}><path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 14-3 3 3 3" /></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="8" r="3" /><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6" /></svg>;
  if (name === "flash") return <svg {...common}><path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z" /><path d="M9 21h6" /></svg>;
  if (name === "crypto") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M9 9.5h4a2 2 0 0 1 0 4H9.5" /><path d="M10.5 7.5v9" /><path d="M13 7.5v2" /><path d="M13 14.5v2" /></svg>;
  if (name === "camera") return <svg {...common}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.4-2h3.2L15 6h2.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" /><circle cx="12" cy="12.5" r="3.2" /></svg>;
  if (name === "request") return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>;
  if (name === "pin") return <svg {...common}><path d="M12 22s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="11" r="2.5" /></svg>;
  if (name === "snowflake") return <svg {...common}><path d="M12 2v20" /><path d="m4.9 6 14.2 12" /><path d="m19.1 6-14.2 12" /><path d="M4 12h16" /></svg>;
  if (name === "receipt") return <svg {...common}><path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>;
  if (name === "headset") return <svg {...common}><path d="M4 12a8 8 0 0 1 16 0" /><rect x="3" y="12" width="4" height="7" rx="2" /><rect x="17" y="12" width="4" height="7" rx="2" /><path d="M19 19a3 3 0 0 1-3 3h-2" /></svg>;
  if (name === "document") return <svg {...common}><path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>;
  if (name === "chevronRight") return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;

  return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
}

export function renderQuickActionIcon(icon: IconName) {
  const accentMap: Partial<Record<IconName, string>> = {
    wallet: "#60a5fa",
    receive: "#3b82f6",
    service: "#93c5fd",
    transfer: "#3b82f6",
  };
  return <AppIcon name={icon} size={20} stroke={accentMap[icon] || "#3b82f6"} />;
}

export function renderNavIcon(item: NavItem, active: boolean) {
  const stroke = active ? "#3b82f6" : "rgba(255,255,255,0.3)";
  const iconName: Record<NavItem, IconName> = {
    Accueil: "grid",
    Cartes: "card",
    Privilèges: "spark",
    Profil: "user",
  };
  return <AppIcon name={iconName[item]} size={18} stroke={stroke} />;
}
