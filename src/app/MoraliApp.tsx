'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { encryptPinWithPassword, decryptPinWithPassword } from "@/lib/pin-utils";
import { logAdminAction } from "@/lib/admin-logger";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Extracted components & shared code ──
import type { Screen, NavItem, AuthTab, ForgotStep, RegisterData, TransactionType, IconName, AdminTab, Transaction, NotificationItem, PaymentContact, SearchServiceItem, SearchContactItem, MoraliUser, FirestoreMoraliUser, FirestoreTransfer, AdminActivityLog, AdminConfirmAction, FirestoreNotification, VirtualCardDoc, BlackCardDoc, OperatorKey, TxActionKey } from "@/types/morali";
import {
  sanitizeInput,
  sanitizeAmount,
  formatCurrency,
  formatAmount,
  formatStat,
  timeAgo,
  getStrength,
  firebaseAuthMessage,
  getIdentitySeed,
  generateMoraliIdentity,
  getIdentityCacheKey,
  getCachedIdentityForUid,
  cacheIdentityForUid,
  maskCardNumber,
  generateCardNumber,
  buildMoraliUser,
  chartDays,
} from "@/lib/helpers";
import AuthView, { type ProfileFormData } from "@/components/bank/AuthView";
import DashboardView from "@/components/bank/DashboardView";
import NotificationsPanel from "@/components/bank/NotificationsPanel";
import ProfileView from "@/components/bank/ProfileView";
import QrScanner from "@/components/bank/QrScanner";
import CardsView from "@/components/bank/CardsView";
import TransactionsView from "@/components/bank/TransactionsView";
import TransferView from "@/components/bank/TransferView";
import LegalTerms from "@/components/bank/LegalTerms";
import PrivacyPolicy from "@/components/bank/PrivacyPolicy";
import AdminDashboard, { type AdminDashboardHandle, type AdminDashboardProps } from "@/components/bank/AdminDashboard";
import { useToast } from "@/hooks/useToast";

// ── All types are imported from @/types/morali ──
// AuthTab, ForgotStep, Screen, AdminTab, NavItem, TransactionType, RegisterData, IconName,
// Transaction, NotificationItem, PaymentContact, SearchServiceItem, SearchContactItem,
// MoraliUser, FirestoreMoraliUser, FirestoreTransfer, AdminActivityLog, AdminConfirmAction,
// FirestoreNotification, VirtualCardDoc, BlackCardDoc, OperatorKey, TxActionKey

import './app-styles.css';

// CSS extracted to app-styles.css


// Helper to build chart data from live transactions
const buildChartData = (txs: Transaction[], bal: number, days?: typeof chartDays) => {
  const usedDays = days || chartDays;

  // Helper: extract positive numeric value from formatted amount strings like "+ FCFA 5 000"
  const parseNum = (amountStr: string): number => {
    const cleaned = amountStr.replace(/[^\d]/g, "");
    return parseInt(cleaned, 10) || 0;
  };

  // Build date ranges for each chart day
  const dayRanges = usedDays.map((d) => {
    const start = new Date(d.year, d.month, d.day, 0, 0, 0).getTime();
    const end = new Date(d.year, d.month, d.day, 23, 59, 59, 999).getTime();
    return { start, end };
  });

  const dayData = usedDays.map((d, i) => {
    // Match transactions by dateTimestamp (ms) against each day's range
    const matching = txs.filter((tx) => {
      const ts = tx.dateTimestamp;
      if (!ts) return false;
      return ts >= dayRanges[i].start && ts <= dayRanges[i].end;
    });

    if (matching.length > 0) {
      const credits = matching.filter((t) => t.type === "credit").reduce((sum, t) => sum + parseNum(t.amount), 0);
      const debits = matching.filter((t) => t.type === "debit").reduce((sum, t) => sum + parseNum(t.amount), 0);
      return { amount: credits + debits, credits, debits, hasRealData: true };
    }

    // No real data for this day — return zeros
    return { amount: 0, credits: 0, debits: 0, hasRealData: false };
  });

  // maxAmount of at least 1 to avoid division by zero
  const maxAmount = Math.max(...dayData.map((d) => d.amount), 1);

  // Build cumulative balance trajectory for sparkline from REAL net flows only
  const netFlows = dayData.map((d) => d.credits - d.debits);
  const len = usedDays.length;
  const trajectory: number[] = new Array(len);
  trajectory[len - 1] = bal; // Last day = current balance
  // Walk backwards: balance[N-1] = balance[N] - netFlow[N]
  for (let i = len - 2; i >= 0; i--) {
    trajectory[i] = trajectory[i + 1] - netFlows[i];
  }

  return {
    heights: dayData.map((d) => d.amount > 0 ? Math.max(12, Math.round((d.amount / maxAmount) * 80)) : 0),
    amounts: dayData.map((d) => d.amount),
    netFlow: netFlows,
    credits: dayData.map((d) => d.credits),
    debits: dayData.map((d) => d.debits),
    hasRealData: dayData.map((d) => d.hasRealData),
    trajectory,
  };
};

const quickActions = [
  { label: "Dépôt", icon: "wallet", message: "Effectuer un dépôt", action: "depot" },
  { label: "Retrait", icon: "receive", message: "Effectuer un retrait", action: "retrait" },
  { label: "Services", icon: "service", message: "Accéder aux services", action: "service" },
  { label: "Transférer", icon: "transfer", message: "Transférer des fonds", action: "transfer" },
] as const;

const navItems: NavItem[] = ["Accueil", "Cartes", "Privilèges", "Profil"];

const serviceTiles: Array<{ icon: IconName; name: string; desc: string; accent: string; badge?: string }> = [
  { icon: "phone", name: "Crédit", desc: "MTN & Airtel", badge: "-5%", accent: "#60a5fa" },
  { icon: "globe", name: "Internet", desc: "Pass Data", accent: "#60a5fa" },
  { icon: "tv", name: "Canal+", desc: "Réabonnement", accent: "#a78bfa" },
  { icon: "bolt", name: "Électricité", desc: "Factures & Jetons", accent: "#fbbf24" },
  { icon: "droplet", name: "Eau", desc: "SNDE / LCDE", accent: "#38bdf8" },
  { icon: "qr", name: "Marchand", desc: "Payer par QR", accent: "#22c55e" },
];

const initialPaymentContacts: PaymentContact[] = [];
const cardActions = [
  { icon: "snowflake" as IconName, label: "Geler la carte", sub: "Sécurité instantanée" },
  { icon: "pin" as IconName, label: "Code PIN", sub: "Carte confidentielle" },
  { icon: "service" as IconName, label: "Limites", sub: "Gérer les plafonds" },
  { icon: "request" as IconName, label: "Nouvelle", sub: "Carte virtuelle" },
];

const profileGroups = [
  {
    title: "Mon Compte",
    items: [
      { icon: "user" as IconName, label: "Informations Personnelles" },
      { icon: "shield" as IconName, label: "Sécurité & Biométrie", badge: "Activé" },
      { icon: "lock" as IconName, label: "Confidentialité" },
      { icon: "receipt" as IconName, label: "Historique des Reçus" },
      { icon: "headset" as IconName, label: "Support Client", sub: "Réponse en 5min" },
    ],
  },
  {
    title: "Légal",
    items: [
      { icon: "document" as IconName, label: "Conditions d'utilisation" },
      { icon: "eye-off" as IconName, label: "Politique de confidentialité" },
    ],
  },
];

const myServices: SearchServiceItem[] = [
  { id: "credit", name: "Recharge Crédit", category: "Quotidien", icon: "phone" },
  { id: "internet", name: "Forfait Internet", category: "Quotidien", icon: "globe" },
  { id: "canal", name: "Canal+ Afrique", category: "TV", icon: "tv" },
  { id: "merchant", name: "Paiement Marchand", category: "QR", icon: "qr" },
  { id: "crypto", name: "Acheter USDT", category: "Finance", icon: "crypto" },
  { id: "loan", name: "Micro-Crédit", category: "Prêt", icon: "flash" },
  { id: "personalloan", name: "Prêt Personnel", category: "Prêt", icon: "bank" },
  { id: "wallet", name: "Portefeuilles", category: "Finance", icon: "wallet" },
  { id: "tontine", name: "Tontine Digitale", category: "Épargne", icon: "users" },
  { id: "savings", name: "Épargne", category: "Finance", icon: "piggy" },
  { id: "utility-elec", name: "Électricité", category: "Quotidien", icon: "bolt" },
  { id: "utility-water", name: "Eau", category: "Quotidien", icon: "droplet" },
];

const myContacts: SearchContactItem[] = [];

const moraliDirectory: MoraliUser[] = [];

// Format for stat cards: "+ 260 000" or "- 110 000" with proper spacing
function MoraliShield({ small = false }: { small?: boolean }) {
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

function ArrowRightIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function EyeIcon({ off = false }: { off?: boolean }) {
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

function MoraliMarkIcon({ size = 18, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17V7l7 5 7-5v10" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 7l7 5 7-5" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppIcon({ name, size = 20, stroke = "currentColor" }: { name: IconName; size?: number; stroke?: string }) {
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

  if (name === "morali") {
    return <MoraliMarkIcon size={size} stroke={stroke} />;
  }

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

function renderQuickActionIcon(icon: IconName) {
  const accentMap: Partial<Record<IconName, string>> = {
    wallet: "#60a5fa",
    receive: "#3b82f6",
    service: "#93c5fd",
    transfer: "#3b82f6",
  };
  return <AppIcon name={icon} size={20} stroke={accentMap[icon] || "#3b82f6"} />;
}

function renderNavIcon(item: NavItem, active: boolean) {
  const stroke = active ? "#3b82f6" : "rgba(255,255,255,0.3)";
  const iconName: Record<NavItem, IconName> = {
    Accueil: "grid",
    Cartes: "card",
    Privilèges: "spark",
    Profil: "user",
  };

  return <AppIcon name={iconName[item]} size={18} stroke={stroke} />;
}

class RenderGuard extends React.Component<{children: React.ReactNode}, {hasError: boolean; errorDetail: string}> {
  state = { hasError: false, errorDetail: "" };
  static getDerivedStateFromError(error: Error) {
    const detail = error.message || String(error);
    // Log the full error with stack to console for debugging
    console.error("[RenderGuard] Caught render error:", detail);
    console.error("[RenderGuard] Error stack:", error.stack);
    // Try to extract object keys from React #62
    const keysMatch = detail.match(/object with keys \{([^}]+)\}/);
    if (keysMatch) console.error("[RenderGuard] Object keys:", keysMatch[1]);
    return { hasError: true, errorDetail: detail };
  }
  render() {
    if (this.state.hasError) {
      // Don't crash - show a minimal UI and let the user continue
      return (
        <div style={{padding:20,background:"#050b1a",color:"#94a3b8",fontFamily:"system-ui",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{textAlign:"center",maxWidth:300}}>
            <p style={{color:"#fff",fontWeight:700,marginBottom:8}}>Erreur de rendu</p>
            {process.env.NODE_ENV === "development" 
              ? <p style={{fontSize:11,wordBreak:"break-all"}}>{this.state.errorDetail?.substring(0, 200)}</p>
              : <p style={{fontSize:11,color:"#94a3b8"}}>Une erreur est survenue. Veuillez réessayer.</p>
            }
            <button onClick={() => this.setState({hasError:false, errorDetail:""})} style={{marginTop:16,padding:"10px 24px",background:"#3b82f6",border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer"}}>Réessayer</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const adminRef = useRef<AdminDashboardHandle>(null);
  const [screen, setScreen] = useState<Screen>("auth");
  const [transactionReturnScreen, setTransactionReturnScreen] = useState<Screen>("dashboard");
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [forgotDemoOtp, setForgotDemoOtp] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotVerifying, setForgotVerifying] = useState(false);
  const [forgotVerified, setForgotVerified] = useState(false);
  const [forgotNewPw, setForgotNewPw] = useState("");
  const [forgotConfirmPw, setForgotConfirmPw] = useState("");
  const [forgotResetting, setForgotResetting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [regPinDraft, setRegPinDraft] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regPinStep, setRegPinStep] = useState<"create" | "confirm">("create");
  const [regPinSaving, setRegPinSaving] = useState(false);
  const [navActive, setNavActive] = useState<NavItem>("Accueil");
  const { toastMessage, toastVisible, showToast, toastTimerRef } = useToast();
  const pendingCreditsClaimedRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  // Helper: get Firebase auth headers for API requests
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const user = firebaseAuth.currentUser;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user) {
      try {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      } catch { /* token fetch failed — proceed without auth (will get 401) */ }
    }
    return headers;
  };

  // Helper: track bank revenue (fees) via API — fire-and-forget
  const trackBankRevenue = (type: string, amount: number, description?: string) => {
    if (amount <= 0) return;
    fetch("/api/revenue/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amount: Math.round(amount), description: description || `${type} — ${Math.round(amount)} FCFA` }),
    }).catch(() => { /* revenue tracking best-effort — never block user flow */ });
  };

  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState("");

  const [registerData, setRegisterData] = useState<RegisterData>({
    prenom: "",
    nom: "",
    email: "",
    tel: "",
    prefix: "+242",
    pw: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [demoOtpCode, setDemoOtpCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [revealAttempts, setRevealAttempts] = useState(0);
  const [revealLockedUntil, setRevealLockedUntil] = useState(0);
  const [dashboardName, setDashboardName] = useState("Utilisateur");
  const [cardTransform, setCardTransform] = useState("rotateX(4deg) rotateY(-3deg)");
  const [cardLocked, setCardLocked] = useState(false);
  const [cardNumberRevealed, setCardNumberRevealed] = useState(false);
  const [cardGenerating, setCardGenerating] = useState(false);
  const [customCardData, setCustomCardData] = useState<{ cardNumber?: string; cardCcv?: string; cardExp?: string } | null>(null);
  const [, setTick] = useState(0);
  const [chartTooltip, setChartTooltip] = useState<{ index: number } | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7j" | "30j" | "6m">("7j");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>("depot");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionMethod, setTransactionMethod] = useState<"mtn" | "airtel">("mtn");
  const [transactionPhone, setTransactionPhone] = useState("");
  const [transactionChoiceOpen, setTransactionChoiceOpen] = useState(false);
  const [transactionDestination] = useState<"cash">("cash");
  const [transactionPinOpen, setTransactionPinOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [transactionProcessing, setTransactionProcessing] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionPinVerifying, setTransactionPinVerifying] = useState(false);
  const [loanAmount, setLoanAmount] = useState(5000);
  const [personalLoanAmount, setPersonalLoanAmount] = useState(250000);
  const [personalLoanDuration, setPersonalLoanDuration] = useState(6);
  const [microCreditDuration, setMicroCreditDuration] = useState<15 | 30 | 45>(30);
  const [microCreditReason, setMicroCreditReason] = useState("");
  const [personalLoanReason, setPersonalLoanReason] = useState("");
  const [personalLoanIncome, setPersonalLoanIncome] = useState("");
  const [personalLoanStep, setPersonalLoanStep] = useState<"form" | "confirm" | "done">("form");
  const [microCreditStep, setMicroCreditStep] = useState<"form" | "confirm" | "done">("form");
  const [loanApplicationStatus, setLoanApplicationStatus] = useState<"idle" | "loading" | "submitted" | "error">("idle");
  const [activeLoanType, setActiveLoanType] = useState<"micro" | "personal" | null>(null);
  const [xafAmount, setXafAmount] = useState("");
  const [currencyAmount, setCurrencyAmount] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<"EUR" | "USD">("EUR");
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({ EUR: 0.00152, USD: 0.00160 });
  const [currencyDirection, setCurrencyDirection] = useState<"sell" | "buy">("sell");
  const [fxSwapping, setFxSwapping] = useState(false);
  const [eurWallet, setEurWallet] = useState(0);
  const [usdWallet, setUsdWallet] = useState(0);
  const [airtimeOperator, setAirtimeOperator] = useState<"mtn" | "airtel">("mtn");
  const [airtimePhone, setAirtimePhone] = useState("");
  const [airtimeAmount, setAirtimeAmount] = useState("");
  const [internetOperator, setInternetOperator] = useState<"mtn" | "airtel">("mtn");
  const [internetPhone, setInternetPhone] = useState("");
  const [internetAmount, setInternetAmount] = useState("");
  const [savingsAmount, setSavingsAmount] = useState(150000);
  const [serviceProcessing, setServiceProcessing] = useState(false);
  const [canalDecoder, setCanalDecoder] = useState("");
  const [canalPlan, setCanalPlan] = useState("");
  const [elecMeter, setElecMeter] = useState("");
  const [elecAmount, setElecAmount] = useState("");
  const [waterMeter, setWaterMeter] = useState("");
  const [waterAmount, setWaterAmount] = useState("");
  const [savingsCustomAmount, setSavingsCustomAmount] = useState("");
  const [pendingPinAction, setPendingPinAction] = useState<{ type: "merchant" | "savings_deposit" | "savings_withdraw"; amount: number } | null>(null);
  const [tontineGroups, setTontineGroups] = useState<{ name: string; contributionAmount: string; members: { name: string; paid: boolean }[]; pot?: number }[]>([]);
  const [tontineName, setTontineName] = useState("");
  const [tontineContributionAmount, setTontineContributionAmount] = useState("");
  const [tontineNewMemberName, setTontineNewMemberName] = useState("");
  const [cryptoRate, setCryptoRate] = useState(650);
  const [merchantAmount, setMerchantAmount] = useState("");
  const [servicesQuery, setServicesQuery] = useState("");
  const [servicesFocused, setServicesFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [verifiedMoraliUser, setVerifiedMoraliUser] = useState<MoraliUser | null>(null);
  const [paymentContacts, setPaymentContacts] = useState<PaymentContact[]>(initialPaymentContacts);
  const [requestQrOpen, setRequestQrOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const transferInitialQueryRef = useRef<string | undefined>(undefined);

  // ── Admin Dashboard State extracted to AdminDashboard.tsx ──
  // visualViewport hack supprimé — géré par interactive-widget=resizes-content + 100dvh sur le layout racine

  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [bankingIdentity, setBankingIdentity] = useState({ id: "", rib: "" });
  const [copiedIdentityField, setCopiedIdentityField] = useState<"id" | "rib" | null>(null);
  const [cardManageOpen, setCardManageOpen] = useState(false);
  const [cardPinOpen, setCardPinOpen] = useState(false);
  const [cardLimitsOpen, setCardLimitsOpen] = useState(false);
  const [cardPinRevealed, setCardPinRevealed] = useState(false);
  const [revealedPinDigits, setRevealedPinDigits] = useState("");
  const [savedCardPin, setSavedCardPin] = useState("");
  const [savedCardPinHash, setSavedCardPinHash] = useState("");
  const [savedCardPinSalt, setSavedCardPinSalt] = useState("");
  const [sessionPinPlaintext, setSessionPinPlaintext] = useState("");
  const [cardPinDraft, setCardPinDraft] = useState("");
  const [cardPinConfirm, setCardPinConfirm] = useState("");
  const [cardPinPassword, setCardPinPassword] = useState("");
  const [revealAccountPw, setRevealAccountPw] = useState("");
  const [revealVerifying, setRevealVerifying] = useState(false);
  const [revealNeedsPin, setRevealNeedsPin] = useState(false);
  const [revealPinRaw, setRevealPinRaw] = useState("");
  const [revealPinVerifying, setRevealPinVerifying] = useState(false);
  const [revealVerifiedPw, setRevealVerifiedPw] = useState("");
  // ── pinVerifying removed — moved to TransferView ──
  const [changePinAccountPw, setChangePinAccountPw] = useState("");
  const [cardPinStage, setCardPinStage] = useState<"setup" | "menu" | "reveal" | "change" | "reset">("setup");
  const [pinResetSending, setPinResetSending] = useState(false);
  const [pinResetOtpSent, setPinResetOtpSent] = useState(false);
  const [pinResetOtpCode, setPinResetOtpCode] = useState("");
  const [pinResetDemoOtp, setPinResetDemoOtp] = useState("");
  const [pinResetVerifying, setPinResetVerifying] = useState(false);
  const [pinResetVerified, setPinResetVerified] = useState(false);
  const [pinResetNewPin, setPinResetNewPin] = useState("");
  const [pinResetConfirmPin, setPinResetConfirmPin] = useState("");
  const cardPinExistsRef = useRef(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [passwordStage, setPasswordStage] = useState<"menu" | "change">("menu");
  const [changePwOld, setChangePwOld] = useState("");
  const [changePwNew, setChangePwNew] = useState("");
  const [changePwConfirm, setChangePwConfirm] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyTab, setPrivacyTab] = useState<"policy" | "settings">("policy");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "scanning" | "found" | "error">("idle");
  const [scannedData, setScannedData] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerStatusRef = useRef(scannerStatus);
  // Keep ref in sync with state
  scannerStatusRef.current = scannerStatus;
  const [quickNotif, setQuickNotif] = useState<{ open: boolean; type: string; label: string; amount: string; icon: IconName; color: string } | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<Array<{ id: string; device: string; browser: string; time: string; current: boolean }>>([]);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [platformAuthSupported, setPlatformAuthSupported] = useState(false);
  const [deviceAlertShown, setDeviceAlertShown] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [tontineDistConfirm, setTontineDistConfirm] = useState<{ groupIndex: number; pot: number; members: number; sharePerMember: number } | null>(null);

  // ── KYC States ──
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycStep, setKycStep] = useState<1 | 2 | 3>(1);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycFirestoreStatus, setKycFirestoreStatus] = useState<"none" | "submitted" | "under_review" | "approved" | "rejected">("none");
  const [kycDocType, setKycDocType] = useState<"national_id" | "passport" | "driver_license">("national_id");
  const [kycDocNumber, setKycDocNumber] = useState("");
  const [kycDob, setKycDob] = useState("");
  const [kycDocFront, setKycDocFront] = useState<string | null>(null);
  const [kycDocBack, setKycDocBack] = useState<string | null>(null);
  const [kycSelfie, setKycSelfie] = useState<string | null>(null);
  const kycSelfieVideoRef = useRef<HTMLVideoElement>(null);
  const kycSelfieCanvasRef = useRef<HTMLCanvasElement>(null);
  const kycSelfieStreamRef = useRef<MediaStream | null>(null);

  // Fetch KYC status from Firestore on login
  useEffect(() => {
    if (!authUid) return;
    (async () => {
      try {
        const res = await fetch("/api/kyc", { headers: await getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setKycFirestoreStatus(data.status || "none");
        }
      } catch { /* silent */ }
    })();
  }, [authUid]);

  // Check biometric & platform auth support on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then((avail) => {
        setBiometricSupported(avail);
        setPlatformAuthSupported(avail);
      }).catch(() => {
        setBiometricSupported(false);
        setPlatformAuthSupported(false);
      });
    }
  }, []);

  const trackLoginDevice = useCallback(async () => {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
      const isMobile = /Android|iPhone|iPad/i.test(ua);
      const device = isMobile ? "Mobile" : "Desktop";
      let browser = "Navigateur";
      if (ua.includes("Chrome")) browser = "Chrome";
      else if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Safari")) browser = "Safari";
      else if (ua.includes("Edge")) browser = "Edge";

      const newDevice = {
        id: `${device}-${Date.now()}`,
        device,
        browser,
        time: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        current: true,
      };

      if (!authUid) return;
      const devDoc = await getDoc(doc(firebaseDb, "users", authUid, "meta", "devices"));
      if (devDoc.exists()) {
        const existing = devDoc.data().devices || [];
        const updated = existing.map((d: Record<string, unknown>) => ({ ...d, current: false }));
        const final = [newDevice, ...updated].slice(0, 5);
        setConnectedDevices(final);
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "devices"), { devices: final }, { merge: true });
      } else {
        setConnectedDevices([newDevice]);
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "devices"), { devices: [newDevice] }, { merge: true });
      }
    } catch (err) {
      console.error("Erreur tracking device:", err);
    }
  }, [authUid]);
  const [securitySettings, setSecuritySettings] = useState({
    biometrics: false,
    faceId: false,
    deviceAlerts: true,
    transactionValidation: true,
  });
  // Dynamic security level for profile badge
  const secLevelCount = Object.values(securitySettings).filter(Boolean).length;
  const [privacySettings, setPrivacySettings] = useState({
    profileVisible: false,
    activityMasking: false,
    analyticsConsent: false,
    marketingConsent: false,
  });
  const [savedPrivacySettings, setSavedPrivacySettings] = useState({
    profileVisible: false,
    activityMasking: false,
    analyticsConsent: false,
    marketingConsent: false,
  });
  const [privacySaveState, setPrivacySaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [privacyAccessLogOpen, setPrivacyAccessLogOpen] = useState(false);
  const [privacyCloseConfirmOpen, setPrivacyCloseConfirmOpen] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [virtualCardOpen, setVirtualCardOpen] = useState(false);
  const [virtualCardData, setVirtualCardData] = useState<VirtualCardDoc | null>(null);
  const [virtualCardLoading, setVirtualCardLoading] = useState(false);
  const [blackCardOpen, setBlackCardOpen] = useState(false);
  const [blackCardData, setBlackCardData] = useState<BlackCardDoc | null>(null);
  const [blackCardLoading, setBlackCardLoading] = useState(false);
  const [blackCardCvvVisible, setBlackCardCvvVisible] = useState(false);
  const [blackCardMaterial, setBlackCardMaterial] = useState<"steel" | "carbon">("steel");
  const [blackCardCelebrationOpen, setBlackCardCelebrationOpen] = useState(false);
  const [blackCardStep, setBlackCardStep] = useState<"preview" | "material" | "confirm">("preview");
  const [blackCardFullName, setBlackCardFullName] = useState("");
  const [blackCardPhone, setBlackCardPhone] = useState("");
  const [blackCardAddress, setBlackCardAddress] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportThreads, setSupportThreads] = useState<Array<{ id: string; message: string; status: string; createdAtLabel: string }>>([]);
  const [revealedAmounts, setRevealedAmounts] = useState<Record<string, boolean>>({});
  const [cardSettings, setCardSettings] = useState({
    online: true,
    international: false,
    atm: true,
  });
  const [profileForm, setProfileForm] = useState(() => {
    if (typeof window !== "undefined") {
      const savedFullName = window.localStorage.getItem("morali_profile_full_name") || "Utilisateur";
      const savedPhone = window.localStorage.getItem("morali_profile_phone") || "";
      const savedAddress = window.localStorage.getItem("morali_profile_address") || "Brazzaville, Congo";
      return {
        fullName: savedFullName,
        phone: savedPhone,
        address: savedAddress,
        city: "",
        country: "",
        bio: "",
      };
    }
    return {
      fullName: "Utilisateur",
      phone: "",
      address: "Brazzaville, Congo",
      city: "",
      country: "",
      bio: "",
    };
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [liveTransactions, setLiveTransactions] = useState<Transaction[]>([]);
  const [firestoreBalance, setFirestoreBalance] = useState<number | null>(null);

  // Tick every 30s to refresh relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time listener on moraliUsers/{authUid} for balance
  useEffect(() => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as FirestoreMoraliUser;
        if (typeof data.balance === "number") {
          // Trust the Firestore value — it reflects real transactions
          // Clamp to 0 minimum to prevent negative display
          setFirestoreBalance(Math.max(0, data.balance));
        } else {
          // Initialize balance for existing users who don't have it yet
          const initialBalance = 0;
          updateDoc(userRef, { balance: initialBalance }).catch((err: unknown) => { console.error("Erreur initialisation solde:", err); });
          setFirestoreBalance(initialBalance);
        }
        // Load savings balance from Firestore
        if (typeof data.savingsBalance === "number") {
          setSavingsAmount(data.savingsBalance);
        }
        // Load tontine groups from Firestore
        if (Array.isArray(data.tontineGroups) && data.tontineGroups.length > 0) {
          setTontineGroups(data.tontineGroups);
        }
        // Load forex wallets from Firestore
        if (typeof data.eurWallet === "number") {
          setEurWallet(data.eurWallet);
        }
        if (typeof data.usdWallet === "number") {
          setUsdWallet(data.usdWallet);
        }

        // Auto-claim pending credits on first snapshot (fire-and-forget)
        if (!pendingCreditsClaimedRef.current) {
          pendingCreditsClaimedRef.current = true;
          (async () => {
            try {
              const pendingRes = await fetch(`/api/directory/pending-credit?uid=${authUid}`, {
                headers: await getAuthHeaders(),
              });
              const pendingData = await pendingRes.json().catch(() => ({ credits: [] }));
              const pendingCredits = (pendingData.credits || []).filter(
                (c: { status: string }) => c.status === "pending"
              );
              for (const credit of pendingCredits) {
                await fetch("/api/directory/pending-credit", {
                  method: "PUT",
                  headers: await getAuthHeaders(),
                  body: JSON.stringify({ pendingCreditId: credit.id }),
                }).catch(() => {});
              }
            } catch {
              // Silent — processPendingCredits via onSnapshot will retry
            }
          })();
        }
      }
    });
    return () => unsub();
  }, [authUid]);

  // Auto-repair balance disabled — caused permission errors from composite Firestore queries
  // (kept as no-op for future reactivation with proper indexes)
  useEffect(() => {
    // no-op
  }, [authUid]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // ── Escape key closes modals ──
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (blackCardOpen) { setBlackCardOpen(false); return; }
        if (cameraScannerOpen) { closeCameraScanner(); return; }
        if (securityModalOpen) { setSecurityModalOpen(false); return; }
        if (privacyModalOpen) { setPrivacyModalOpen(false); return; }
        if (contactModalOpen) { closeContactModal(); return; }
        if (historyModalOpen) { setHistoryModalOpen(false); return; }
        if (receiptsOpen) { setReceiptsOpen(false); return; }
        if (supportOpen) { setSupportOpen(false); return; }
        if (termsOpen) { setTermsOpen(false); return; }
        if (virtualCardOpen) { setVirtualCardOpen(false); return; }
        if (cardLimitsOpen) { setCardLimitsOpen(false); return; }
        if (cardManageOpen) { setCardManageOpen(false); return; }
        if (cardPinOpen) { closePinModal(); return; }
        if (infoDrawerOpen) { setInfoDrawerOpen(false); return; }
        if (transferOpen) { setTransferOpen(false); return; }
        const serviceScreens: Screen[] = ["credit", "internet", "canalplus", "electricity", "water", "crypto", "tontine", "merchant", "microcredit", "personalloan", "loans", "currency", "savings", "wallet"];
        if (serviceScreens.includes(screen)) { setScreen("dashboard"); return; }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [blackCardOpen, cameraScannerOpen, securityModalOpen, privacyModalOpen, contactModalOpen, historyModalOpen, receiptsOpen, supportOpen, termsOpen, virtualCardOpen, cardLimitsOpen, cardManageOpen, cardPinOpen, infoDrawerOpen, transferOpen, screen]);

  useEffect(() => {
    getRedirectResult(firebaseAuth).catch((err: unknown) => {
      // On mobile/iOS, the auth state listener below will pick up the session.
      console.error("Erreur redirect auth:", err);
    });

    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setAuthUid(null);
        setAuthChecked(true);
        setAccountSuspended(false);
        setSuspensionMessage("");
        setScreen("auth");
        return;
      }

      setAuthUid(user.uid);
      try {
        const profileSnap = await getDoc(doc(firebaseDb, "moraliUsers", user.uid));

        if (profileSnap.exists()) {
          const data = profileSnap.data() as FirestoreMoraliUser;

          // ── Vérification suspension ──
          if (data.accountStatus === "suspended") {
            setAccountSuspended(true);
            setSuspensionMessage("Votre compte a été suspendu par un administrateur. Veuillez contacter le support.");
            setAuthChecked(true);
            return;
          }
          setAccountSuspended(false);
          setSuspensionMessage("");

          const firestoreName = data.fullName || `${data.firstName} ${data.lastName}`.trim() || "";
          // Fallback: Firebase Auth displayName, then email-based name
          const firebaseName = user.displayName || "";
          const emailName = user.email ? user.email.split("@")[0] : "";
          const emailCapitalized = emailName ? `${emailName.charAt(0).toUpperCase()}${emailName.slice(1)}` : "";
          const fullName = firestoreName || firebaseName || emailCapitalized || "Utilisateur";
          setDashboardName(fullName);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("morali_profile_full_name", fullName);
          }
          // Auto-repair: sync displayName to Firebase Auth if missing
          if (!user.displayName && fullName && fullName !== "Utilisateur") {
            updateProfile(user, { displayName: fullName }).catch(() => {});
          }
          // Auto-repair: if Firestore has no name but we derived one, save it back
          if (!data.fullName && !data.firstName && fullName !== "Utilisateur") {
            const repaired = { firstName: fullName.split(" ")[0] || "", lastName: fullName.split(" ").slice(1).join(" ") || "", fullName };
            updateDoc(doc(firebaseDb, "moraliUsers", user.uid), repaired).catch(() => {});
          }
          setProfileForm({
            fullName,
            phone: data.phone || "",
            address: profileForm.address || "Brazzaville, Congo",
            city: "",
            country: "",
            bio: "",
          });
          setLoginEmail(data.email || user.email || "");

          if (!data.moraliId || !data.rib) {
            const immediateIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
            setBankingIdentity(immediateIdentity);
            cacheIdentityForUid(user.uid, immediateIdentity);
            const repairedIdentity = await persistMoraliProfile(user.uid);
            setBankingIdentity(repairedIdentity || immediateIdentity);
          } else {
            const loadedIdentity = { id: data.moraliId, rib: data.rib };
            cacheIdentityForUid(user.uid, loadedIdentity);
            setBankingIdentity(loadedIdentity);
            // Ensure directory entry exists for existing users (self-repair)
            const dirData = {
              fullName: data.fullName || `${data.firstName} ${data.lastName}`.trim() || "Utilisateur",
              pseudo: data.pseudo || "",
              moraliId: data.moraliId,
            };
            ensureDirectoryLookup(user.uid, dirData);
            publishDirectoryEntry(user.uid, {
              fullName: data.fullName || `${data.firstName} ${data.lastName}`.trim() || "Utilisateur",
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              pseudo: data.pseudo || "",
              moraliId: data.moraliId,
            }).catch((err: unknown) => { console.error("Erreur publication annuaire:", err); });
          }

          setScreen("dashboard");
          setNavActive("Accueil");
        } else {
          const immediateIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
          setBankingIdentity(immediateIdentity);
          cacheIdentityForUid(user.uid, immediateIdentity);
          const repairedIdentity = await persistMoraliProfile(user.uid);
          setBankingIdentity(repairedIdentity || immediateIdentity);
        }

        // ── Check monthly maintenance fee (1000 FCFA/month from registration) ──
        try {
          const maintRes = await fetch("/api/account/maintenance", { method: "POST", headers: await getAuthHeaders() });
          if (maintRes.ok) {
            const maintData = await maintRes.json();
            if (maintData.charged && maintData.amount > 0) {
              const monthsLabel = maintData.monthsCharged === 1 ? "1 mois" : `${maintData.monthsCharged} mois`;
              showToast(`Frais d'entretien : ${maintData.amount.toLocaleString("fr-FR")} FCFA (${monthsLabel})`);
            }
          }
        } catch { /* maintenance check best-effort — never block login */ }
      } catch {
        const fallbackIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
        setBankingIdentity(fallbackIdentity);
        cacheIdentityForUid(user.uid, fallbackIdentity);
      } finally {
        setAuthChecked(true);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUid) return;

    // Queries with ONLY where+limit (no orderBy) — no composite index needed
    const txSentQuery = query(collection(firebaseDb, "transactions"), where("senderUid", "==", authUid), limit(50));
    const txReceivedQuery = query(collection(firebaseDb, "transactions"), where("recipientUid", "==", authUid), limit(50));
    const notifQuery = query(collection(firebaseDb, "users", authUid, "notifications"), limit(6));
    const supportQuery = query(collection(firebaseDb, "users", authUid, "supportTickets"), limit(6));

    const mapTxDoc = (docSnap: { data: () => unknown }, isSent: boolean): Transaction | null => {
      const data = docSnap.data() as FirestoreTransfer;
      // Skip directory entries
      if ((data as Record<string, unknown>).type === "__directory__" || (data as Record<string, unknown>).status === "directory") return null;
      const isCredit = data.type === "depot" || data.type === "recharge" || (!isSent && data.type === "virement");
      const isIncoming = !isSent && data.type === "virement";
      // Compute real timestamp from Firestore createdAt
      let ts: number | undefined;
      const rawTs = data.createdAt;
      if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
        ts = (rawTs as { seconds: number; nanoseconds?: number }).seconds * 1000;
      } else if (typeof rawTs === "string") {
        const parsed = Date.parse(rawTs);
        if (!isNaN(parsed)) ts = parsed;
      } else if (typeof rawTs === "number") {
        ts = rawTs;
      }
      // Determine display name and category based on transaction type
      const txType = data.type;
      let txIcon: IconName;
      let txName: string;
      let txCategory: string;
      let txChannel: string;
      if (isIncoming) {
        txIcon = "receive";
        txName = `Virement de ${data.senderName}`;
        txCategory = "Reçu";
        txChannel = "Morali Transfer";
      } else if (txType === "virement") {
        txIcon = "send";
        txName = `Virement vers ${data.recipientName}`;
        txCategory = "Virement";
        txChannel = "Morali Transfer";
      } else if (txType === "depot" || txType === "recharge") {
        txIcon = "wallet";
        txName = txType === "recharge" ? "Recharge" : "Dépôt Mobile Money";
        txCategory = "Revenus";
        txChannel = data.destination === "cash" ? "Mobile Money" : txType === "recharge" ? "Recharge Admin" : "Mobile Money";
      } else {
        txIcon = "receive";
        txName = "Retrait Mobile Money";
        txCategory = "Retrait";
        txChannel = "Mobile Money";
      }
      return {
        icon: txIcon,
        bg: isCredit ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.04)",
        name: txName,
        date: ts ? timeAgo(ts) : "Récent",
        dateTimestamp: ts,
        amount: formatAmount(data.amount, isCredit ? "credit" : "debit"),
        type: isCredit ? "credit" : "debit",
        category: txCategory,
        receiptId: data.receiptId,
        status: data.status,
        channel: txChannel,
      };
    };

    // Use refs to avoid race condition between two onSnapshot listeners
    let sentTxs: Transaction[] = [];
    let receivedTxs: Transaction[] = [];

    const mergeAndSet = () => {
      const merged = [...receivedTxs, ...sentTxs];
      // Deduplicate by receiptId
      const seen = new Set<string>();
      const deduped = merged.filter(t => {
        if (!t.receiptId || seen.has(t.receiptId)) return false;
        seen.add(t.receiptId);
        return true;
      });
      // Sort by timestamp descending
      deduped.sort((a, b) => (b.dateTimestamp || 0) - (a.dateTimestamp || 0));
      setLiveTransactions(deduped.slice(0, 30));
    };

    const unsubTxSent = onSnapshot(txSentQuery, (snap) => {
      sentTxs = snap.docs.map((d) => mapTxDoc(d, true)).filter(Boolean) as Transaction[];
      mergeAndSet();
    });

    const unsubTxReceived = onSnapshot(txReceivedQuery, (snap) => {
      receivedTxs = snap.docs.map((d) => mapTxDoc(d, false)).filter(Boolean) as Transaction[];
      mergeAndSet();
    });

    const unsubNotif = onSnapshot(notifQuery, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as FirestoreNotification & { createdAt?: { seconds?: number } | string };
        let time = data.time || "À l'instant";
        let ts = 0;
        const rawTs = data.createdAt;
        if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
          ts = (rawTs as { seconds: number }).seconds * 1000;
        } else if (typeof rawTs === "string") {
          const parsed = Date.parse(rawTs);
          if (!isNaN(parsed)) ts = parsed;
        }
        if (ts) time = timeAgo(ts);
        return { id: docSnap.id, ...data, time, _ts: ts } as NotificationItem & { _ts: number };
      });
      // Sort newest first (highest timestamp at top)
      next.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      if (next.length) setNotifications(next);
    });

    // Also listen to serverNotifications (fallback collection with open read/write rules)
    let serverNotifs: (NotificationItem & { _ts: number; targetUid?: string })[] = [];
    const serverNotifQuery = query(
      collection(firebaseDb, "serverNotifications"),
      where("targetUid", "==", authUid),
      limit(10)
    );
    const unsubServerNotif = onSnapshot(serverNotifQuery, (snap) => {
      serverNotifs = snap.docs.map((docSnap) => {
        const data = docSnap.data() as FirestoreNotification & { targetUid?: string; createdAt?: { seconds?: number } | string };
        let time = data.time || "À l'instant";
        let ts = 0;
        const rawTs = data.createdAt;
        if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
          ts = (rawTs as { seconds: number }).seconds * 1000;
        } else if (typeof rawTs === "string") {
          const parsed = Date.parse(rawTs);
          if (!isNaN(parsed)) ts = parsed;
        }
        if (ts) time = timeAgo(ts);
        return { id: docSnap.id, ...data, time, _ts: ts } as NotificationItem & { _ts: number; targetUid?: string };
      });
      // Merge with subcollection notifications (dedupe by title+time)
      setNotifications((prev) => {
        const existingKeys = new Set(prev.map((n) => `${n.title}-${n.time}`));
        const newNotifs = serverNotifs.filter((n) => !existingKeys.has(`${n.title}-${n.time}`));
        const merged = [...newNotifs, ...prev];
        merged.sort((a, b) => ((a as NotificationItem & { _ts?: number })._ts || 0) - ((b as NotificationItem & { _ts?: number })._ts || 0));
        return merged;
      });
    });

    const unsubSupport = onSnapshot(supportQuery, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as { message?: string; status?: string; createdAt?: { seconds?: number } };
        const createdLabel = data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toLocaleDateString("fr-FR") : "À l'instant";
        return { id: docSnap.id, message: data.message ?? "Demande support", status: data.status ?? "Ouvert", createdAtLabel: createdLabel };
      });
      setSupportThreads(next);
    });

    return () => {
      unsubTxSent();
      unsubTxReceived();
      unsubNotif();
      unsubServerNotif();
      unsubSupport();
    };
  }, [authUid]);

  // Process pending transfer credits — polls every 3 seconds while logged in
  useEffect(() => {
    if (!authUid) return;
    // Initial check after 2s to let auth settle
    const initialTimer = setTimeout(() => {
      processPendingCredits(authUid, true); // silent on first load
    }, 2000);
    // Listen for pending credits via onSnapshot (real-time instead of polling)
    const pendingRef = collection(firebaseDb, "pendingCredits");
    let pendingUnsub: (() => void) | null = null;
    try {
      const q = query(pendingRef, where("recipientUid", "==", authUid), where("status", "==", "pending"));
      pendingUnsub = onSnapshot(q, (snap) => {
        if (snap.docs.length > 0) {
          processPendingCredits(authUid);
        }
      });
    } catch {
      // If pendingCredits collection doesn't exist, fall back to initial check only
    }
    return () => {
      clearTimeout(initialTimer);
      pendingUnsub?.();
    };
  }, [authUid]);

  const saveTontineGroups = async (groups: typeof tontineGroups) => {
    if (!authUid) return;
    try {
      await updateDoc(doc(firebaseDb, "moraliUsers", authUid), { tontineGroups: groups });
    } catch {}
  };

  useEffect(() => {
    if (authTab === "register" && currentStep === 3 && !showRegisterSuccess && !showPinSetup) {
      const timer = window.setTimeout(() => otpInputRef.current?.focus(), 250);
      return () => window.clearTimeout(timer);
    }
  }, [authTab, currentStep, showRegisterSuccess, showPinSetup]);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [screen]);

  useEffect(() => {
    if (!contactModalOpen) return;
    const currentQuery = contactQuery.trim();
    if (currentQuery.length < 3) {
      setVerifiedMoraliUser(null);
      setContactSearchLoading(false);
      return;
    }

    let cancelled = false;
    setContactSearchLoading(true);

    const timer = window.setTimeout(async () => {
      const found = await findMoraliUser(currentQuery);

      if (!cancelled) {
        setVerifiedMoraliUser(found.user);
        setContactSearchLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contactModalOpen, contactQuery, bankingIdentity.id, profileForm.fullName, dashboardName]);

  useEffect(() => {
    if (authUid) return;
    setBankingIdentity({ id: "", rib: "" });
  }, [authUid]);

  // Fix mobile keyboard: scroll to field when keyboard opens, restore position when closes
  useEffect(() => {
    // Lock body scroll only on auth screen (prevent keyboard push issue)
    if (screen === "auth") {
      document.body.classList.add("lock-scroll");
    } else {
      document.body.classList.remove("lock-scroll");
    }

    // Save scroll position of ALL scrollable containers before keyboard opens
    const scrollPosBeforeKeyboard = new Map<HTMLElement, number>();
    let lastViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    let keyboardWasOpen = false;

    const saveScrollPositions = () => {
      scrollPosBeforeKeyboard.clear();
      document.querySelectorAll<HTMLElement>(".auth-scroll, .content-scrollable, .card-modal, .bc-modal, .modal-drawer-content").forEach((el) => {
        scrollPosBeforeKeyboard.set(el, el.scrollTop);
      });
    };

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const restoreScrollPositions = () => {
      // Debounce: wait for keyboard animation to fully finish
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        scrollPosBeforeKeyboard.forEach((scrollPos, el) => {
          if (el.isConnected) {
            el.scrollTop = scrollPos;
          }
        });
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        keyboardWasOpen = false;
      }, 300);
    };

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Save current scroll positions IMMEDIATELY before keyboard pushes anything
        saveScrollPositions();

        if ((target as HTMLElement).hasAttribute("data-needs-scroll")) {
          // Aggressive scroll: wait for keyboard to fully open, then scroll
          const doScroll = () => {
            const scrollParent = target.closest<HTMLElement>(".auth-scroll, .content-scrollable, .card-modal, .bc-modal, .modal-drawer-content, .loan-screen, .fx-screen, .wallet-screen, .savings-screen, .privileges-screen");
            if (scrollParent) {
              const inputTop = target.offsetTop - scrollParent.offsetTop + scrollParent.scrollTop;
              scrollParent.scrollTop = Math.max(0, inputTop - 100);
            }
          };
          setTimeout(doScroll, 350);
          setTimeout(doScroll, 600);
          setTimeout(doScroll, 900);
        }
        if ((target as HTMLElement).hasAttribute("data-no-scroll")) {
          setTimeout(() => {
            const authScroll = document.querySelector(".auth-scroll") as HTMLElement | null;
            if (authScroll) authScroll.scrollTop = 0;
          }, 50);
        }
      }
    };

    // DO NOT restore on focusout — keyboard is still closing, it would override our restore
    // Instead, restore ONLY on visualViewport resize when height INCREASES (keyboard closing)

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;

        // Track keyboard state: if viewport shrunk, keyboard opened
        if (currentHeight < window.innerHeight * 0.85) {
          keyboardWasOpen = true;
        }

        // If viewport GREW and keyboard was open → keyboard is closing → restore
        if (currentHeight > lastViewportHeight && keyboardWasOpen) {
          restoreScrollPositions();
        }

        lastViewportHeight = currentHeight;
      }
    };

    // Block scroll on body/window only — not on inner scrollable containers
    const blockScroll = (e: Event) => {
      if (e.target === document || e.target === document.body || e.target === document.documentElement) {
        e.preventDefault();
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", blockScroll, { passive: false });
    }
    document.addEventListener("scroll", blockScroll, { passive: false });

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
        window.visualViewport.removeEventListener("scroll", blockScroll);
      }
      document.removeEventListener("scroll", blockScroll);
      if (restoreTimer) clearTimeout(restoreTimer);
      document.body.classList.remove("lock-scroll");
    };
  }, [screen]);

  useEffect(() => {
    const storedPrivacy = window.localStorage.getItem("morali_privacy_settings");
    if (!storedPrivacy) return;
    try {
      const parsed = JSON.parse(storedPrivacy) as typeof privacySettings;
      setPrivacySettings(parsed);
      setSavedPrivacySettings(parsed);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    // Clean up any legacy plaintext PIN from localStorage (security)
    window.localStorage.removeItem("morali_card_pin");
    window.localStorage.removeItem("morali_card_pin_hash");
    window.localStorage.removeItem("morali_card_pin_salt");
    // Restore PIN existence from localStorage (set during registration/creation)
    // This avoids needing an API call or Firestore read on every page load
    if (window.localStorage.getItem("morali_pin_exists") === "true") {
      cardPinExistsRef.current = true;
      setSavedCardPinHash("server-stored");
    }
    // PIN existence API check runs AFTER auth (see authUid-dependent useEffect below)
  }, []);

  // Load card & security settings from Firestore on auth
  useEffect(() => {
    if (!authUid) return;
    const loadSettings = async () => {
      // ── PIN check: localStorage first (instant), API as secondary verification ──
      // Skip if already known from localStorage (set in initial useEffect)
      if (!cardPinExistsRef.current) {
        try {
          const token = await firebaseAuth.currentUser?.getIdToken();
          if (token) {
            const res = await fetch("/api/pin/exists", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.exists) {
              cardPinExistsRef.current = true;
              setSavedCardPinHash("server-stored");
              window.localStorage.setItem("morali_pin_exists", "true");
            }
          }
        } catch (pinErr) {
          console.error("[loadSettings] PIN check error:", pinErr);
        }
      }

      try {
        const [cardSnap, secSnap, privSnap, profileSnap] = await Promise.all([
          getDoc(doc(firebaseDb, "users", authUid, "meta", "cardSettings")),
          getDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings")),
          getDoc(doc(firebaseDb, "users", authUid, "meta", "privacySettings")),
          getDoc(doc(firebaseDb, "moraliUsers", authUid)),
        ]);
        if (cardSnap.exists()) {
          const d = cardSnap.data();
          setCardSettings((prev) => ({
            online: d.online !== undefined ? d.online : prev.online,
            international: d.international !== undefined ? d.international : prev.international,
            atm: d.atm !== undefined ? d.atm : prev.atm,
          }));
          // Restore card lock state
          if (d.locked !== undefined) {
            setCardLocked(d.locked);
          }
        }
        if (secSnap.exists()) {
          const d = secSnap.data();
          setSecuritySettings((prev) => ({
            biometrics: d.biometrics !== undefined ? d.biometrics : prev.biometrics,
            faceId: d.faceId !== undefined ? d.faceId : prev.faceId,
            deviceAlerts: d.deviceAlerts !== undefined ? d.deviceAlerts : prev.deviceAlerts,
            transactionValidation: d.transactionValidation !== undefined ? d.transactionValidation : prev.transactionValidation,
          }));
        }
        // Load privacy settings from Firestore
        if (privSnap.exists()) {
          const d = privSnap.data();
          setPrivacySettings((prev) => ({
            profileVisible: d.profileVisible !== undefined ? d.profileVisible : prev.profileVisible,
            activityMasking: d.activityMasking !== undefined ? d.activityMasking : prev.activityMasking,
            analyticsConsent: d.analyticsConsent !== undefined ? d.analyticsConsent : prev.analyticsConsent,
            marketingConsent: d.marketingConsent !== undefined ? d.marketingConsent : prev.marketingConsent,
          }));
          setSavedPrivacySettings(privacySettings);
        }
        // Load phone from Firestore profile
        if (profileSnap.exists()) {
          const d = profileSnap.data();
          if (d.phone) {
            setProfileForm((prev) => ({ ...prev, phone: d.phone }));
          }
          if (d.address) {
            setProfileForm((prev) => ({ ...prev, address: d.address }));
          }
        }
      } catch { /* silent fail, defaults will be used */ }
    };
    loadSettings();
  }, [authUid]);

  useEffect(() => {
    if (!bankingIdentity.id) return;
    persistMoraliProfile().catch((err: unknown) => {
      console.error("Erreur sauvegarde profil:", err);
    });
  }, [bankingIdentity.id, profileForm.fullName, profileForm.phone, profileForm.address, registerData.prefix, registerData.tel, registerData.email, loginEmail, dashboardName]);

  const passwordStrength = useMemo(() => getStrength(registerData.pw), [registerData.pw]);

  // ── KYC Level Calculation ──
  // Uses Firestore kycRecords status when available, falls back to profile completion
  const kycLevel = useMemo(() => {
    // Firestore KYC status takes priority
    if (kycFirestoreStatus === "approved") return 3;
    if (kycFirestoreStatus === "under_review" || kycFirestoreStatus === "submitted") return 2;
    // Fallback: profile-based estimation
    const hasName = (profileForm.fullName || "").trim().length >= 2;
    const hasPhone = (profileForm.phone || "").trim().length >= 8;
    const hasAddress = (profileForm.address || "").trim().length >= 5 && (profileForm.address || "").trim() !== "Brazzaville, Congo";
    if (hasName && hasPhone && hasAddress) return 2; // Base (pending real verification)
    if (hasName && hasPhone) return 1;
    return 0; // Non vérifié
  }, [kycFirestoreStatus, profileForm.fullName, profileForm.phone, profileForm.address]);

  const kycConfig = useMemo(() => {
    if (kycLevel === 3) return { label: "Vérifié", color: "#22c55e", bg: "rgba(34,197,94,.15)", border: "rgba(34,197,94,.4)", text: "KYC Complet", pct: "100%" };
    if (kycLevel === 2) return { label: "Base", color: "#eab308", bg: "rgba(234,179,8,.15)", border: "rgba(234,179,8,.4)", text: kycFirestoreStatus === "submitted" || kycFirestoreStatus === "under_review" ? "En cours de vérification" : "KYC Partiel", pct: "50%" };
    if (kycLevel === 1) return { label: "Non vérifié", color: "#f97316", bg: "rgba(249,115,22,.12)", border: "rgba(249,115,22,.3)", text: "Non vérifié", pct: "25%" };
    return { label: "Non vérifié", color: "#64748b", bg: "rgba(100,116,139,.15)", border: "rgba(100,116,139,.3)", text: "Non vérifié", pct: "0%" };
  }, [kycLevel, kycFirestoreStatus]);

  const transactionNumericAmount = parseInt(transactionAmount || "0", 10) || 0;
  // MORALI FEES: Dépôt = 0% (gratuit), Retrait = 2% (identique à MTN Congo)
  const WITHDRAWAL_FEE_RATE = 0.02;
  const fees = transactionType === "depot" ? 0 : Math.floor(transactionNumericAmount * WITHDRAWAL_FEE_RATE);
  const transactionTotal = transactionType === "depot" ? transactionNumericAmount : Math.max(transactionNumericAmount - fees, 0);

  // ── MTN & Airtel Money limits (Congo-Brazzaville) ──
  type OperatorKey = "mtn" | "airtel";
  type TxActionKey = "depot" | "retrait";
  const OPERATOR_LIMITS: Record<OperatorKey, Record<TxActionKey, { daily: number; monthly: number; label: string }>> = {
    mtn: {
      depot:   { daily: 999000000,  monthly: 999000000, label: "MTN MoMo" },
      retrait: { daily: 300000,     monthly: 1500000,    label: "MTN MoMo" },
    },
    airtel: {
      depot:   { daily: 999000000,  monthly: 999000000, label: "Airtel Money" },
      retrait: { daily: 250000,     monthly: 1200000,    label: "Airtel Money" },
    },
  };

  const microInterest = 0.05;
  const microDailyRate = microCreditDuration === 15 ? 0.03 : microCreditDuration === 30 ? 0.05 : 0.075;
  const microTotalToPay = loanAmount + loanAmount * microDailyRate;
  const personalLoanRate = 0.12;
  const personalLoanInterest = personalLoanAmount * (personalLoanRate * (personalLoanDuration / 12));
  const personalLoanMonthlyRepayment = (personalLoanAmount + personalLoanInterest) / personalLoanDuration;
  const personalLoanTotalToRepay = personalLoanAmount + personalLoanInterest;
  const microMonthlyRepayment = microCreditDuration <= 30 ? microTotalToPay : microTotalToPay;
  const cryptoUsdtValue = xafAmount ? (parseFloat(xafAmount) / cryptoRate).toFixed(2) : "0.00";
  const currencyFee = 0.015; // 1.5% commission
  const currencyConverted = currencyAmount ? (parseFloat(currencyAmount) * currencyRates[targetCurrency]).toFixed(2) : "0.00";
  // Fetch real-time exchange rates from the API
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const [eurRes, usdRes] = await Promise.all([
          fetch("/api/exchange-rate?from=XAF&to=EUR", { headers: await getAuthHeaders() }),
          fetch("/api/exchange-rate?from=XAF&to=USD", { headers: await getAuthHeaders() }),
        ]);
        const newRates: Record<string, number> = { ...currencyRates };
        if (eurRes.ok) {
          const eurData = await eurRes.json();
          newRates["EUR"] = eurData.rate; // how many EUR per 1 XAF
        }
        if (usdRes.ok) {
          const usdData = await usdRes.json();
          newRates["USD"] = usdData.rate; // how many USD per 1 XAF
        }
        setCurrencyRates(newRates);
      } catch { /* keep default fallback rates */ }
    };
    fetchRates();
    const interval = setInterval(fetchRates, 10 * 60 * 1000); // refresh every 10 min
    return () => clearInterval(interval);
  }, []);

  const savingsAnnualRate = 4.5;
  const savingsMonthlyGain = (savingsAmount * (savingsAnnualRate / 100)) / 12;
  const tontineMembers: { name: string; status: string; current: boolean }[] = [];

  const filteredServices = useMemo(() => {
    if (!servicesQuery.trim()) return [] as SearchServiceItem[];
    const q = servicesQuery.toLowerCase();
    return myServices.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [servicesQuery]);

  const filteredContacts = useMemo(() => {
    if (!servicesQuery.trim()) return [] as SearchContactItem[];
    const q = servicesQuery.toLowerCase();
    return myContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [servicesQuery]);

  const dashboardData = useMemo(() => {
    const firstName = registerData.prenom || dashboardName || "Utilisateur";
    const base = firstName.length * 137;
    const balance = firestoreBalance !== null ? firestoreBalance : 0;
    const income = 0;
    const expenses = 0;
    const savingsRate = "0%";
    const totalStats = "0 opération";
    const holder = (registerData.prenom && registerData.nom)
      ? `${registerData.prenom} ${registerData.nom}`.toUpperCase()
      : dashboardName !== "Utilisateur" ? dashboardName.toUpperCase() : firstName.toUpperCase();
    const initials = `${(registerData.prenom || dashboardName || firstName).charAt(0)}${registerData.nom ? registerData.nom.charAt(0) : (dashboardName || firstName).split(" ").slice(1)[0]?.charAt(0) || ""}`.toUpperCase() || "U";
    const cardNumber = `4251 98${String(base).slice(0, 2)} ${String(1000 + (base % 9000)).slice(-4)} ${String(2000 + ((base * 3) % 8000)).slice(-4)}`;
    const blackCardNumber = `5399 12${String(base + 77).slice(0, 2)} ${String(1000 + ((base + 33) % 9000)).slice(-4)} ${String(3000 + ((base * 7) % 7000)).slice(-4)}`;
    const expMonth = String(((firstName.length * 3) % 12) + 1).padStart(2, "0");
    const expYear = String(27 + (firstName.length % 4));
    const blackExpMonth = String(((firstName.length * 5 + 2) % 12) + 1).padStart(2, "0");
    const blackExpYear = String(28 + (firstName.length % 3));

    const transactions: Transaction[] = [];

    return {
      balance,
      income,
      expenses,
      savingsRate,
      totalStats,
      holder,
      initials,
      cardNumber,
      blackCardNumber,
      cardExp: `${expMonth}/${expYear}`,
      cardCcv: String(100 + (base % 900)),
      blackCardExp: `${blackExpMonth}/${blackExpYear}`,
      blackCardCcv: String(100 + ((base + 55) % 900)),
      transactions,
    };
  }, [dashboardName, registerData.nom, registerData.prenom, firestoreBalance]);

  // Track operator usage for limit enforcement
  const operatorUsage = useMemo(() => {
    const allTxs = liveTransactions.length > 0 ? liveTransactions : dashboardData.transactions;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

    const usage: Record<OperatorKey, Record<TxActionKey, { daily: number; monthly: number }>> = {
      mtn:    { depot: { daily: 0, monthly: 0 }, retrait: { daily: 0, monthly: 0 } },
      airtel: { depot: { daily: 0, monthly: 0 }, retrait: { daily: 0, monthly: 0 } },
    };

    allTxs.forEach((tx) => {
      const ts = tx.dateTimestamp || Date.now();
      const isToday = ts >= startOfDay;
      const isThisMonth = ts >= startOfMonth;
      if (!isToday && !isThisMonth) return;

      const isDepot = tx.type === "credit" && (tx.name.includes("Dépôt") || tx.category === "Revenus");
      const isRetrait = tx.type === "debit" && (tx.name.includes("Retrait") || tx.category === "Retrait");
      if (!isDepot && !isRetrait) return;

      const opKeys: OperatorKey[] = ["mtn", "airtel"];
      opKeys.forEach((op) => {
        if (isDepot) {
          if (isToday) usage[op].depot.daily += 1;
          if (isThisMonth) usage[op].depot.monthly += 1;
        }
        if (isRetrait) {
          if (isToday) usage[op].retrait.daily += 1;
          if (isThisMonth) usage[op].retrait.monthly += 1;
        }
      });
    });

    return usage;
  }, [liveTransactions, dashboardData.transactions]);

  const unreadNotificationsCount = notifications.filter((item) => !item.read).length;

  // Dynamic chart data connected to transactions
  const allChartTxs = liveTransactions.length > 0 ? liveTransactions : dashboardData.transactions;
  const chartBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;

  // Dynamic chart days based on selected period
  const dynamicChartDays = useMemo(() => {
    const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const days = [];
    const daysBack = chartPeriod === "7j" ? 6 : chartPeriod === "30j" ? 29 : 180;
    const step = chartPeriod === "6m" ? 3 : 1;
    for (let d = daysBack; d >= 0; d -= step) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      days.push({
        label: `${date.getDate()} ${monthNames[date.getMonth()]}`,
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        dateStr: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      });
    }
    return days.slice(0, 12);
  }, [chartPeriod]);

  const chartData = useMemo(() => buildChartData(allChartTxs, chartBalance, dynamicChartDays), [allChartTxs, chartBalance, dynamicChartDays]);

  // Real weekly stats from live transactions (credits = revenus, debits = dépenses)
  const weeklyStats = useMemo(() => {
    // Extract numeric value from amount string like "+ FCFA 1 500 000" or "- FCFA 500 000"
    const parseAmount = (amountStr: string): number => {
      const cleaned = amountStr.replace(/[^\d]/g, "");
      return parseInt(cleaned, 10) || 0;
    };

    // Compute period window in ms (7j=7d, 30j=30d, 6m=180d) — generous 1-day buffer
    const periodMs = (chartPeriod === "7j" ? 7 : chartPeriod === "30j" ? 30 : 180) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - periodMs;

    let totalIncome = 0;
    let totalExpenses = 0;
    let txCount = 0;

    for (const tx of allChartTxs) {
      const ts = tx.dateTimestamp;
      // Include transactions with a timestamp within the period, OR without timestamp (recent)
      if (ts && ts < cutoff) continue;

      const num = parseAmount(tx.amount);
      if (num <= 0) continue;
      txCount++;

      if (tx.type === "credit") {
        totalIncome += num;
      } else {
        totalExpenses += num;
      }
    }

    const hasRealData = totalIncome > 0 || totalExpenses > 0;
    let savingsRate: string;
    if (!hasRealData) {
      // No transactions at all
      savingsRate = "—";
    } else if (totalIncome === 0 && totalExpenses > 0) {
      // Expenses but no income
      savingsRate = "0%";
    } else {
      const pct = Math.max(0, Math.min(100, Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)));
      savingsRate = `${pct}%`;
    }

    return {
      income: totalIncome,
      expenses: totalExpenses,
      savingsRate,
      txCount: txCount > 0 ? `${txCount} opération${txCount > 1 ? "s" : ""}` : "0 opération",
      hasRealData,
    };
  }, [allChartTxs, chartPeriod]);

  // Dynamic smart sparkline — luminous glow, smart slope driven by real balance trajectory
  const sparklinePath = useMemo(() => {
    const W = 320;
    const H = 72;
    const PAD_TOP = Math.round(H * 0.20);
    const PAD_BOT = Math.round(H * 0.20);
    const usableH = H - PAD_TOP - PAD_BOT;
    const traj = chartData.trajectory;
    if (!traj || traj.length < 2) {
      return { curveLine: "M0,36 L320,36", fillArea: "M0,36 L320,36 L320,72 L0,72 Z", endPt: { x: 320, y: 36 } };
    }

    // Normalize trajectory to fit within usable height
    const minVal = Math.min(...traj);
    const maxVal = Math.max(...traj);
    const range = maxVal - minVal || 1;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < traj.length; i++) {
      const x = Math.round((i / (traj.length - 1)) * W);
      // Normalize: higher balance = lower y (top), lower balance = higher y (bottom)
      const norm = (traj[i] - minVal) / range; // 0 = min balance, 1 = max balance
      const yRatio = 1 - norm; // Invert: max balance at top (0), min at bottom (1)
      const y = Math.round(PAD_TOP + yRatio * usableH);
      points.push({ x, y });
    }

    const buildCurve = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return "";
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpy1 = prev.y + (curr.y - prev.y) * 0.15;
        const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
        const cpy2 = curr.y - (curr.y - prev.y) * 0.15;
        d += ` C${cpx1},${cpy1} ${cpx2},${cpy2} ${curr.x},${curr.y}`;
      }
      return d;
    };

    const curveLine = buildCurve(points);
    const fillArea = `${curveLine} L${W},${H} L0,${H} Z`;

    return { curveLine, fillArea, endPt: points[points.length - 1] };
  }, [chartData]);
  const accessLogEntries = useMemo<{ place: string; device: string; time: string }[]>(() => {
    const logs: { place: string; device: string; time: string }[] = [];
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /Android|iPhone|iPad/i.test(ua);
    const device = isMobile ? "Mobile" : "Desktop";
    // Current session
    logs.push({ place: "Brazzaville, Congo", device, time: "Maintenant" });
    // Generate 2-3 realistic past sessions
    const locations = ["Brazzaville, Congo", "Pointe-Noire, Congo"];
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      const hoursAgo = (i + 1) * Math.floor(Math.random() * 12 + 4);
      const d = new Date(now - hoursAgo * 3600000);
      logs.push({
        place: locations[i % locations.length],
        device: i === 0 ? "Mobile" : "Desktop",
        time: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      });
    }
    return logs;
  }, []);

  const renderProtectedAmount = (key: string, text: string, className = "") => (
    <span className={`${privacySettings.activityMasking && !revealedAmounts[key] ? `amount-blurred ${className}`.trim() : className}`.trim()} onClick={() => toggleAmountReveal(key)}>
      {text}
    </span>
  );

  const markNotificationAsRead = (id: string) => {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    // Persister dans Firestore
    if (authUid) {
      updateDoc(doc(firebaseDb, "users", authUid, "notifications", id), { read: true }).catch(() => {});
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    // Persister dans Firestore
    if (authUid) {
      notifications.filter((n) => !n.read).forEach((n) => {
        updateDoc(doc(firebaseDb, "users", authUid, "notifications", n.id), { read: true }).catch(() => {});
      });
    }
  };

  const openCameraScanner = () => {
    setCameraScannerOpen(true);
    setScannerStatus("scanning");
    setScannedData(null);
  };

  const handleQRResult = useCallback((decodedText: string) => {
    // Stop scanning
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    scanLoopRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScannerStatus("found");
    setScannedData(decodedText);
    try {
      const data = JSON.parse(decodedText);
      if (data.app === "MoraliBank" && data.userId) {
        showToast(`Compte Morali détecté: ${data.userId}`);
        setTimeout(() => {
          closeCameraScanner();
          setScreen("payments");
          setNavActive("Transferts" as NavItem);
          transferInitialQueryRef.current = data.userId;
          setTransferOpen(true);
        }, 1500);
      } else {
        showToast("QR code non reconnu");
        setTimeout(() => {
          setScannerStatus("scanning");
          setScannedData(null);
          initCameraStream();
        }, 2000);
      }
    } catch {
      showToast("QR code non reconnu");
      setTimeout(() => {
        setScannerStatus("scanning");
        setScannedData(null);
        initCameraStream();
      }, 2000);
    }
  }, []);

  const handleQRResultRef = useRef(handleQRResult);
  handleQRResultRef.current = handleQRResult;

  const initCameraStream = useCallback(async () => {
    // Stop any existing stream
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;

      // Wait for video element to be available
      const waitForVideo = (): Promise<void> => {
        return new Promise((resolve) => {
          if (videoRef.current) {
            resolve();
            return;
          }
          const check = () => {
            if (videoRef.current) {
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        });
      };

      await waitForVideo();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScannerStatus("scanning");

      const jsQR = (await import("jsqr")).default;
      const scan = () => {
        // Use ref to check current status (no stale closure)
        const currentStatus = scannerStatusRef.current;
        if (currentStatus !== "scanning") return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          scanLoopRef.current = requestAnimationFrame(scan);
          return;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            handleQRResultRef.current(code.data);
            return;
          }
        }
        scanLoopRef.current = requestAnimationFrame(scan);
      };
      scanLoopRef.current = requestAnimationFrame(scan);
    } catch (err) {
      setScannerStatus("error");
      showToast("Caméra non disponible");
    }
  }, []);

  // useEffect to start camera when modal opens
  useEffect(() => {
    if (cameraScannerOpen && scannerStatus === "scanning") {
      // Small delay to let the video element render first
      const timer = setTimeout(() => {
        initCameraStream();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [cameraScannerOpen, scannerStatus, initCameraStream]);

  const closeCameraScanner = () => {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setCameraScannerOpen(false);
    setScannerStatus("idle");
    setScannedData(null);
  };

  // ── KYC Functions ──
  const openKycModal = () => {
    setKycStep(1);
    setKycDocType("national_id");
    setKycDocNumber("");
    setKycDob("");
    setKycDocFront(null);
    setKycDocBack(null);
    setKycSelfie(null);
    setKycModalOpen(true);
  };

  const closeKycModal = () => {
    // Stop selfie camera stream if active
    if (kycSelfieStreamRef.current) {
      kycSelfieStreamRef.current.getTracks().forEach(t => t.stop());
      kycSelfieStreamRef.current = null;
    }
    setKycModalOpen(false);
    setKycStep(1);
  };

  const captureKycImage = (file: File, setter: (v: string | null) => void) => {
    // Compress and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.7);
          setter(compressed);
        }
      };
      img.src = String(e.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const startKycSelfieCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      kycSelfieStreamRef.current = stream;
      if (kycSelfieVideoRef.current) {
        kycSelfieVideoRef.current.srcObject = stream;
      }
    } catch {
      showToast("Caméra inaccessible. Vérifiez les permissions.");
    }
  };

  const captureKycSelfie = () => {
    const video = kycSelfieVideoRef.current;
    const canvas = kycSelfieCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setKycSelfie(canvas.toDataURL("image/jpeg", 0.7));
    }
    // Stop camera after capture
    if (kycSelfieStreamRef.current) {
      kycSelfieStreamRef.current.getTracks().forEach(t => t.stop());
      kycSelfieStreamRef.current = null;
    }
  };

  const submitKyc = async () => {
    if (!authUid) return;
    if (!kycDocFront) { showToast("Veuillez prendre la photo du recto de votre document"); return; }
    if (!kycSelfie) { showToast("Veuillez prendre une photo selfie"); return; }
    setKycSubmitting(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { ...await getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: kycDocType,
          documentFront: kycDocFront,
          documentBack: kycDocBack,
          selfiePhoto: kycSelfie,
          fullName: profileForm.fullName || dashboardName,
          dateOfBirth: kycDob || null,
          documentNumber: kycDocNumber || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKycFirestoreStatus("submitted");
        showToast("Documents soumis avec succès ! Vérification en cours...");
        closeKycModal();
      } else {
        showToast(data.error || "Erreur lors de la soumission");
      }
    } catch {
      showToast("Erreur réseau. Réessayez.");
    } finally {
      setKycSubmitting(false);
    }
  };

  const showQuickNotif = (_type: string, _label: string, _amount: string, _icon: IconName, _color: string) => {
    // Quick notification popup disabled — notifications shown via bell panel
  };

  const openRequestQr = () => {
    setRequestQrOpen(true);
  };

  const closeRequestQr = () => {
    setRequestQrOpen(false);
  };

  // ── openTransferModal: simplified — TransferView handles internal reset ──
  const openTransferModal = () => {
    transferInitialQueryRef.current = undefined;
    setTransferOpen(true);
  };

  // Publish a directory entry so other users can find this user by moraliId/pseudo
  const publishDirectoryEntry = async (uid: string, data: { fullName: string; firstName: string; lastName: string; pseudo: string; moraliId: string }, retries = 2) => {
    if (!uid || !data.moraliId) return;
    const moraliIdNorm = data.moraliId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pseudoNorm = data.pseudo.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
    const dirData = {
      uid,
      moraliId: moraliIdNorm,
      moraliIdNormalized: moraliIdNorm,
      pseudo: pseudoNorm,
      pseudoNormalized: pseudoNorm,
      fullName: sanitizeInput(data.fullName, 100) || "Utilisateur",
      firstName: sanitizeInput(data.firstName, 50),
      lastName: sanitizeInput(data.lastName, 50),
    };

    try {
      // Method 1: Try API route (uses Firebase Admin SDK server-side)
      const res = await fetch("/api/directory/register", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(dirData),
      });
      if (!res.ok && retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return publishDirectoryEntry(uid, data, retries - 1);
      }
      if (res.ok) {
        const result = await res.json().catch(() => null);
        if (result?.source === "client_fallback" || !result?.success) {
          // Server told us to write directly — fall through to Method 2
        } else {
          return; // Success via Admin SDK
        }
      }
    } catch {
      // API failed — falling back to direct Firestore write
    }

    // Method 2: Write directly to Firestore from client (guaranteed to work)
    try {
      const batch = [
        setDoc(doc(firebaseDb, "directory", uid), { ...dirData, updatedAt: serverTimestamp() }, { merge: true }),
      ];
      // O(1) lookup by moraliId
      if (moraliIdNorm) {
        batch.push(setDoc(doc(firebaseDb, "directoryLookup", `morali_${moraliIdNorm}`), {
          uid, moraliId: moraliIdNorm, fullName: dirData.fullName, pseudo: pseudoNorm,
        }, { merge: true }));
      }
      // O(1) lookup by pseudo
      if (pseudoNorm) {
        batch.push(setDoc(doc(firebaseDb, "directoryLookup", `pseudo_${pseudoNorm}`), {
          uid, moraliId: moraliIdNorm, fullName: dirData.fullName, pseudo: pseudoNorm,
        }, { merge: true }));
      }
      await Promise.all(batch);
    } catch (firestoreErr) {
      console.error("[directory] Firestore direct write failed:", firestoreErr);
    }
  };

  const persistMoraliProfile = async (overrideUid?: string) => {
    const uid = overrideUid || authUid;
    if (!uid) return null;

    const userRef = doc(firebaseDb, "moraliUsers", uid);
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Partial<FirestoreMoraliUser>) : null;

    const identitySeed = getIdentitySeed(existingData?.email || loginEmail || registerData.email || firebaseAuth.currentUser?.email, uid);
    const generatedIdentity = generateMoraliIdentity(identitySeed);

    const preservedMoraliId = generatedIdentity.id;
    const preservedRib = generatedIdentity.rib;

    const nextIdentity = { id: preservedMoraliId, rib: preservedRib };
    setBankingIdentity(nextIdentity);
    cacheIdentityForUid(uid, nextIdentity);

    const fullName = sanitizeInput(profileForm.fullName || dashboardName || firebaseAuth.currentUser?.displayName || `${registerData.prenom} ${registerData.nom}`.trim() || existingData?.fullName || "Utilisateur", 100);
    const firstName = sanitizeInput(registerData.prenom.trim() || existingData?.firstName || firebaseAuth.currentUser?.displayName?.split(" ")[0] || fullName.split(" ")[0] || "Utilisateur", 50);
    const lastName = sanitizeInput(registerData.nom.trim() || existingData?.lastName || firebaseAuth.currentUser?.displayName?.split(" ").slice(1).join(" ") || fullName.split(" ").slice(1).join(" "), 50);
    const pseudoBase = fullName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "morali";

    const payload: FirestoreMoraliUser = {
      uid,
      fullName,
      firstName,
      lastName,
      pseudo: existingData?.pseudo || `@${pseudoBase}`.toLowerCase(),
      moraliId: preservedMoraliId,
      moraliIdNormalized: preservedMoraliId.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      rib: preservedRib,
      phone: sanitizeInput(profileForm.phone || existingData?.phone || `${registerData.prefix} ${registerData.tel}`.trim(), 30),
      email: sanitizeInput(registerData.email || loginEmail || existingData?.email || "", 100),
      balance: typeof existingData?.balance === "number" && Number.isFinite(existingData.balance) ? existingData.balance : 0,
      savingsBalance: typeof existingData?.savingsBalance === "number" && Number.isFinite(existingData.savingsBalance) ? existingData.savingsBalance : 0,
      eurWallet: typeof existingData?.eurWallet === "number" && Number.isFinite(existingData.eurWallet) ? existingData.eurWallet : 0,
      usdWallet: typeof existingData?.usdWallet === "number" && Number.isFinite(existingData.usdWallet) ? existingData.usdWallet : 0,
      passwordHint: registerData.pw ? "set" : existingData?.passwordHint,
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Sanitize payload: remove undefined, NaN, and ensure all values are Firestore-compatible
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => {
        if (v === undefined) return false;
        if (typeof v === "number" && !Number.isFinite(v)) return false;
        return true;
      })
    );
    await setDoc(userRef, cleanPayload, { merge: true });

    // Publish directory entry in transactions collection (public read for search)
    await publishDirectoryEntry(uid, { fullName, firstName, lastName, pseudo: payload.pseudo, moraliId: preservedMoraliId });

    return { id: preservedMoraliId, rib: preservedRib };
  };

  const buildMoraliUser = (d: { uid?: string; fullName?: string; pseudo?: string; moraliId?: string; [key: string]: unknown }): MoraliUser => ({
    name: d.fullName || "Utilisateur",
    pseudo: d.pseudo?.startsWith("@") ? d.pseudo : `@${d.pseudo || ""}`,
    account: d.moraliId || "MORALI00000",
    uid: d.uid || "",
    tone: "grad-blue",
  });

  // Ensure directoryLookup entry exists for the current user (self-repair)
  const ensureDirectoryLookup = async (uid: string, data: { fullName: string; pseudo: string; moraliId: string }) => {
    if (!uid || !data.moraliId) return;
    const moraliIdNorm = data.moraliId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pseudoNorm = data.pseudo.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
    try {
      const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `morali_${moraliIdNorm}`));
      if (!lookupDoc.exists()) {
        await publishDirectoryEntry(uid, { fullName: data.fullName, firstName: "", lastName: "", pseudo: data.pseudo, moraliId: data.moraliId });
      }
    } catch {
      // Silent fail — not critical
    }
  };

  const findMoraliUser = async (rawValue: string): Promise<{ user: MoraliUser | null; isSelf: boolean }> => {
    const source = rawValue.trim();
    if (!source) return { user: null, isSelf: false };

    const normalizedMoraliId = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalizedPseudo = source.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");

    // Method 1: Search via API (uses Firebase Admin SDK)
    try {
      const res = await fetch(`/api/directory/search?q=${encodeURIComponent(source)}`, { headers: await getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          if (data.isSelf) {
            return { user: null, isSelf: true };
          }
          if (data.uid) {
            return { user: buildMoraliUser({ uid: data.uid, fullName: data.name, pseudo: data.pseudo, moraliId: data.account }), isSelf: false };
          }
          // API found user but no uid (shouldn't happen with auth) — fall through to Method 2
        }
      }
    } catch {
      /* API lookup failed — try direct Firestore */
    }

    // Method 2: Search directly in Firestore — directoryLookup (O(1) lookup)
    try {
      if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
        const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `morali_${normalizedMoraliId}`));
        if (lookupDoc.exists()) {
          const d = lookupDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }

      if (normalizedPseudo.length >= 2) {
        const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `pseudo_${normalizedPseudo}`));
        if (lookupDoc.exists()) {
          const d = lookupDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }

        // Prefix search fallback
        const prefixSnap = await getDocs(query(
          collection(firebaseDb, "directoryLookup"),
          where("pseudo", ">=", normalizedPseudo),
          where("pseudo", "<=", normalizedPseudo + "\uf8ff"),
          limit(3),
        ));
        for (const snapDoc of prefixSnap.docs) {
          const d = snapDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }
    } catch (firestoreErr) {
      console.error("[directory] directoryLookup search failed:", firestoreErr);
    }

    // Method 3: Fallback — search moraliUsers collection directly
    // This catches users who registered before the directoryLookup was populated
    try {
      if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
        const snap = await getDocs(query(
          collection(firebaseDb, "moraliUsers"),
          where("moraliId", "==", normalizedMoraliId),
          limit(1),
        ));
        for (const snapDoc of snap.docs) {
          const d = snapDoc.data()!;
          // Backfill directoryLookup so next search is O(1)
          publishDirectoryEntry(d.uid, { fullName: d.fullName || "", firstName: d.firstName || "", lastName: d.lastName || "", pseudo: d.pseudo || "", moraliId: d.moraliId }).catch(() => {});
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }
    } catch (err) {
      console.error("[directory] moraliUsers fallback search failed:", err);
    }

    return { user: null, isSelf: false };
  };

  // ── searchMoraliRecipient, handleTransferRecipientQuery, handleTransferPad removed — moved to TransferView ──

  const createRealtimeNotification = async (targetUid: string, item: FirestoreNotification) => {
    try {
      // Always send via API (Admin SDK writes to users/{uid}/notifications)
      const apiRes = await fetch("/api/notifications/create", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ uid: targetUid, ...item }),
      });
      const apiData = await apiRes.json().catch(() => ({}));
      const usedFallback = apiData.fallback;

      // FALLBACK: If Admin SDK was unavailable, write to serverNotifications (open read/write rules)
      // NOTE: Do NOT also write locally to users/{uid}/notifications — the API already handles that.
      // Writing locally caused duplicated notifications (both API and client wrote to same collection).
      if (usedFallback) {
        await addDoc(collection(firebaseDb, "serverNotifications"), {
          ...item,
          targetUid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (notifErr) {
      console.error("[createRealtimeNotification] Error:", notifErr);
      // Last resort: write to serverNotifications
      try {
        await addDoc(collection(firebaseDb, "serverNotifications"), {
          ...item,
          targetUid,
          createdAt: serverTimestamp(),
        });
      } catch { /* silent */ }
    }
  };

  const createRealtimeTransaction = async (payload: FirestoreTransfer) => {
    try {
      await fetch("/api/transactions/create", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    } catch { /* silent — transaction record best-effort */ }
  };

  // Process pending credits — API first, client Firestore fallback
  const processPendingCredits = async (overrideUid?: string, silent?: boolean) => {
    const uid = overrideUid || authUid;
    if (!uid) return;

    const processOneCredit = async (credit: { id: string; amount: number; senderName?: string }, userRef: ReturnType<typeof doc>) => {
      // Credit user's own balance (own doc — allowed by rules)
      await runTransaction(firebaseDb, async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
        const currentBal = userDoc.data().balance || 0;
        tx.update(userRef, { balance: currentBal + credit.amount, updatedAt: serverTimestamp() });
      });
      // Delete processed pending credit
      await deleteDoc(doc(firebaseDb, "pendingCredits", credit.id)).catch(() => {});
      // Notify recipient
      createRealtimeNotification(uid, {
        title: `Virement reçu — FCFA ${formatCurrency(credit.amount)}`,
        time: "À l'instant",
        badge: "Reçu", badgeClass: "nb-green", icon: "receive",
        bg: "rgba(34,197,94,0.12)", read: false,
      }).catch(() => {});
      if (!silent) {
        showQuickNotif("credit", `Virement reçu de ${credit.senderName || "Utilisateur"}`, formatCurrency(credit.amount), "send", "#4ade80");
        await new Promise((r) => setTimeout(r, 3500));
      }
    };

    // Method 1: Try API (Admin SDK)
    try {
      const res = await fetch(`/api/directory/pending-credit?uid=${uid}`, { headers: await getAuthHeaders() });
      if (res.ok) {
        const { credits: pendingCredits } = await res.json();
        if (pendingCredits && pendingCredits.length > 0) {
          const userRef = doc(firebaseDb, "moraliUsers", uid);
          for (const credit of pendingCredits) {
            try { await processOneCredit(credit, userRef); } catch { /* will retry */ }
          }
        }
        return; // API succeeded
      }
    } catch {
      // API failed — fall through to client-side
    }

    // Method 2: Client Firestore fallback (read pendingCredits directly — open rules)
    try {
      const q = query(collection(firebaseDb, "pendingCredits"), where("recipientUid", "==", uid), where("status", "==", "pending"));
      const snap = await getDocs(q);
      if (snap.empty) return;
      const userRef = doc(firebaseDb, "moraliUsers", uid);
      for (const docSnap of snap.docs) {
        const credit = docSnap.data();
        if (!credit.amount) continue;
        try { await processOneCredit({ id: docSnap.id, amount: credit.amount, senderName: credit.senderName }, userRef); } catch { /* will retry */ }
      }
    } catch {
      /* client fallback failed */
    }
  };

  // Helper: credit balance (depot)
  const serviceCreditBalance = async (amount: number) => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    await runTransaction(firebaseDb, async (tx) => {
      const userDoc = await tx.get(userRef);
      const currentBal = userDoc.data()?.balance || 0;
      tx.update(userRef, { balance: currentBal + amount, updatedAt: serverTimestamp() });
    });
  };

  // Helper: debit balance (retrait)
  const serviceDebitBalance = async (amount: number) => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    await runTransaction(firebaseDb, async (tx) => {
      const userDoc = await tx.get(userRef);
      const currentBal = userDoc.data()?.balance || 0;
      if (amount > currentBal) throw new Error("INSUFFICIENT_BALANCE");
      tx.update(userRef, { balance: currentBal - amount, updatedAt: serverTimestamp() });
    });
  };

  // Atomic savings transfer (deposit / withdraw)
  const executeSavingsTransfer = async (mode: "deposit" | "withdraw") => {
    if (!authUid) return;
    const amt = Number(savingsCustomAmount || 0);
    if (amt <= 0) { showToast("Entrez un montant"); return; }
    const userBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
    const userSavings = savingsAmount || 0;
    if (mode === "deposit" && amt > userBalance) { showToast("Solde insuffisant pour alimenter l'épargne"); return; }
    if (mode === "withdraw" && amt > userSavings) { showToast("Solde épargne insuffisant"); return; }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      const userRef = doc(firebaseDb, "moraliUsers", authUid);
      await runTransaction(firebaseDb, async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
        const currentBalance = userDoc.data().balance || 0;
        const currentSavings = userDoc.data().savingsBalance || 0;
        if (mode === "deposit") {
          if (currentBalance < amt) throw new Error("INSUFFICIENT_BALANCE");
          tx.update(userRef, { balance: currentBalance - amt, savingsBalance: currentSavings + amt, updatedAt: serverTimestamp() });
        } else {
          if (currentSavings < amt) throw new Error("INSUFFICIENT_SAVINGS");
          tx.update(userRef, { balance: currentBalance + amt, savingsBalance: currentSavings - amt, updatedAt: serverTimestamp() });
        }
      });
      if (mode === "deposit") {
        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: amt, fees: 0, type: "depot", destination: "savings", status: "success",
          receiptId: "TX-" + Date.now().toString().slice(-8),
        });
        await createRealtimeNotification(authUid, {
          title: `Dépôt Épargne — ${formatCurrency(amt)} FCFA`,
          time: "À l'instant", badge: "Épargne", badgeClass: "nb-green",
          icon: "piggy", bg: "rgba(34,197,94,0.12)", read: false,
        });
        showQuickNotif("credit", "Dépôt Épargne", formatCurrency(amt), "piggy", "#4ade80");
      } else {
        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: amt, fees: 0, type: "retrait", destination: "savings", status: "success",
          receiptId: "TX-" + Date.now().toString().slice(-8),
        });
        await createRealtimeNotification(authUid, {
          title: `Retrait Épargne — ${formatCurrency(amt)} FCFA`,
          time: "À l'instant", badge: "Retrait", badgeClass: "nb-blue",
          icon: "wallet", bg: "rgba(59,130,246,0.12)", read: false,
        });
        showQuickNotif("debit", "Retrait Épargne", formatCurrency(amt), "wallet", "#f43f5e");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else if (msg === "INSUFFICIENT_SAVINGS") showToast("Solde épargne insuffisant");
      else showToast("Opération échouée");
    } finally { setServiceProcessing(false); }
  };

  // Service transactions
  const executeServiceDeposit = async (amount: number, label: string, icon: IconName) => {
    if (!authUid || amount <= 0) { showToast("Montant invalide"); return; }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      await serviceCreditBalance(amount);
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: 0, type: "depot", destination: "cash", status: "success",
        receiptId: "TX-" + Date.now().toString().slice(-8),
      });
      await createRealtimeNotification(authUid, {
        title: `${label} — +${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
        icon, bg: "rgba(34,197,94,0.12)", read: false,
      });
      showQuickNotif("credit", label, formatCurrency(amount), icon, "#4ade80");
    } catch { showToast("Opération échouée"); }
    finally { setServiceProcessing(false); }
  };

  const executeServiceDebit = async (amount: number, label: string, icon: IconName, applyFee: boolean = false) => {
    if (!authUid || amount <= 0) { showToast("Montant invalide"); return; }
    // ── Service fee: 2% on bill payments (électricité, eau, Canal+, internet, etc.) ──
    const SERVICE_FEE_RATE = 0.02;
    const serviceFees = applyFee ? Math.floor(amount * SERVICE_FEE_RATE) : 0;
    const totalDebit = amount + serviceFees;
    const userBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
    if (totalDebit > userBalance) {
      if (serviceFees > 0) {
        showToast(`Solde insuffisant. Montant: ${formatCurrency(amount)} + Frais (2%): ${formatCurrency(serviceFees)} = ${formatCurrency(totalDebit)} FCFA`);
      } else {
        showToast("Solde insuffisant pour cette opération");
      }
      return;
    }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      await serviceDebitBalance(totalDebit);
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: serviceFees, type: "retrait", destination: "cash", status: "success",
        receiptId: "TX-" + Date.now().toString().slice(-8),
      });
      await createRealtimeNotification(authUid, {
        title: serviceFees > 0
          ? `${label} — -${formatCurrency(amount)} FCFA (frais 2%: ${formatCurrency(serviceFees)})`
          : `${label} — -${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "Débit", badgeClass: "nb-blue",
        icon, bg: "rgba(59,130,246,0.12)", read: false,
      });
      showQuickNotif("debit", label, formatCurrency(totalDebit), icon, "#f43f5e");
      // ── Track service fee as bank revenue ──
      if (serviceFees > 0) {
        trackBankRevenue("service_fee", serviceFees, `Frais service ${label} — ${formatCurrency(amount)} FCFA`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else showToast("Opération échouée");
    }
    finally { setServiceProcessing(false); }
  };

  const submitLoanApplication = async (type: "micro" | "personal") => {
    if (!authUid) { showToast("Connexion requise"); return; }
    const amount = type === "micro" ? loanAmount : personalLoanAmount;
    if (amount <= 0) { showToast("Montant invalide"); return; }

    setActiveLoanType(type);
    setLoanApplicationStatus("loading");

    try {
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: 0, type: "retrait", destination: "loan_request", status: "pending",
        receiptId: "LN-" + Date.now().toString().slice(-8),
        loanType: type,
        totalToRepay: type === "micro" ? microTotalToPay : personalLoanTotalToRepay,
        duration: type === "micro" ? microCreditDuration : personalLoanDuration * 30,
        durationLabel: type === "micro" ? `${microCreditDuration} Jours` : `${personalLoanDuration} Mois`,
      });

      await createRealtimeNotification(authUid, {
        title: type === "micro" ? `Demande Microcrédit — ${formatCurrency(amount)} FCFA` : `Demande Prêt Personnel — ${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "En attente", badgeClass: "nb-blue",
        icon: "bank", bg: "rgba(59,130,246,0.12)", read: false,
      });

      setLoanApplicationStatus("submitted");
      if (type === "micro") setMicroCreditStep("done");
      else setPersonalLoanStep("done");
      showToast(type === "micro" ? "Demande de microcrédit envoyée" : "Demande de prêt envoyée");
    } catch (err) {
      setLoanApplicationStatus("error");
      showToast("Erreur lors de l'envoi de la demande");
    }
  };

  // ── executeTransfer, handleTransferPinKey, startTransferPin, confirmTransferAndProceed,
  //     updateTransferDrag, endTransferDrag, beginTransferDrag, shareTransferReceipt,
  //     closeTransferSuccess, and 2 transfer useEffects removed — moved to TransferView ──

  const openInfoDrawer = () => {
    setInfoDrawerOpen(true);
  };

  const closeInfoDrawer = () => {
    setInfoDrawerOpen(false);
  };

  const saveProfileInfos = async () => {
    const normalizedName = profileForm.fullName.trim() || "Utilisateur";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("morali_profile_full_name", normalizedName);
      window.localStorage.setItem("morali_profile_phone", profileForm.phone);
      window.localStorage.setItem("morali_profile_address", profileForm.address);
    }
    setProfileForm((current) => ({ ...current, fullName: normalizedName }));
    setDashboardName(normalizedName);
    if (authUid) {
      await updateDoc(doc(firebaseDb, "moraliUsers", authUid), {
        fullName: normalizedName,
        phone: profileForm.phone,
        address: profileForm.address,
        updatedAt: serverTimestamp(),
      });
    }
    setInfoDrawerOpen(false);
    showToast("Profil mis à jour");
  };

  const copyToClipboard = async (type: "id" | "rib", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdentityField(type);
      window.setTimeout(() => setCopiedIdentityField((current) => (current === type ? null : current)), 1400);
    } catch {
      showToast("Copie impossible pour le moment");
    }
  };

  // ── Real biometric prompt via WebAuthn ──
  const promptBiometric = async (): Promise<boolean> => {
    try {
      if (!window.PublicKeyCredential) return false;
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) return false;
      // Create a dummy challenge for biometric verification
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Morali Pay" },
          user: { id: new Uint8Array(16), name: "morali-user", displayName: "Utilisateur Morali" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 30000,
        },
      });
      return !!credential;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") return false;
      return false;
    }
  };

  // ── Device fingerprint check on login ──
  const checkNewDevice = useCallback(async () => {
    if (!authUid) return;
    try {
      const ua = navigator.userAgent;
      const fingerprint = btoa(ua.slice(0, 120) + "|" + window.screen.width + "x" + window.screen.height + "|" + navigator.language);
      const devRef = doc(firebaseDb, "users", authUid, "meta", "deviceFingerprint");
      const snap = await getDoc(devRef);
      if (snap.exists() && snap.data().fingerprint && snap.data().fingerprint !== fingerprint) {
        // New device detected!
        const secSnap = await getDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings"));
        const alertsEnabled = secSnap.exists() ? secSnap.data().deviceAlerts !== false : true;
        if (alertsEnabled) {
          setDeviceAlertShown(true);
          setTimeout(() => setDeviceAlertShown(false), 8000);
        }
      }
      // Update current device fingerprint
      await setDoc(devRef, { fingerprint, lastSeen: serverTimestamp() }, { merge: true });
    } catch {
      // Silent fail
    }
  }, [authUid]);

  // Check device fingerprint after auth + settings loaded
  useEffect(() => {
    if (authUid) {
      const timer = setTimeout(() => checkNewDevice(), 2000);
      return () => clearTimeout(timer);
    }
  }, [authUid, checkNewDevice]);

  const openSecurityModal = () => {
    setPasswordStage("menu");
    setChangePwOld("");
    setChangePwNew("");
    setChangePwConfirm("");
    setSecurityModalOpen(true);
  };

  const closeSecurityModal = () => {
    setSecurityModalOpen(false);
    setPasswordStage("menu");
    setChangePwOld("");
    setChangePwNew("");
    setChangePwConfirm("");
  };

  const handleChangePassword = async () => {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) {
      showToast("Aucun compte connecté");
      return;
    }
    if (!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim()) {
      showToast("Remplissez tous les champs");
      return;
    }
    if (changePwNew.length < 8) {
      showToast("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (changePwNew !== changePwConfirm) {
      showToast("Les mots de passe ne correspondent pas");
      return;
    }
    if (changePwOld === changePwNew) {
      showToast("Le nouveau mot de passe doit être différent de l'ancien");
      return;
    }
    setChangePwLoading(true);
    try {
      // Re-authenticate with old password (using recommended Firebase method)
      const credential = EmailAuthProvider.credential(user.email, changePwOld.trim());
      await reauthenticateWithCredential(user, credential);
      // Update password
      await updatePassword(user, changePwNew.trim());
      showToast("Mot de passe mis à jour avec succès");
      // Notifier l'utilisateur du changement de mot de passe
      if (authUid) {
        await createRealtimeNotification(authUid, {
          title: "Votre mot de passe a été modifié",
          time: new Date().toLocaleString("fr-FR"),
          badge: "Sécurité",
          badgeClass: "nb-green",
          icon: "lock",
          bg: "rgba(34,197,94,0.12)",
          read: false,
        });
      }
      setPasswordStage("menu");
      setChangePwOld("");
      setChangePwNew("");
      setChangePwConfirm("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential") || msg.includes("INVALID_LOGIN_CREDENTIALS")) {
        showToast("Ancien mot de passe incorrect");
        setChangePwOld("");
      } else if (msg.includes("weak-password") || msg.includes("WEAK_PASSWORD")) {
        showToast("Le nouveau mot de passe est trop faible (min. 8 caractères)");
      } else if (msg.includes("too-many-requests") || msg.includes("TOO_MANY_ATTEMPTS")) {
        showToast("Trop de tentatives. Réessayez dans quelques minutes.");
      } else {
        showToast("Erreur lors du changement de mot de passe");
        console.error("Change password error:", err);
      }
    } finally {
      setChangePwLoading(false);
    }
  };

  const saveSecuritySettings = async () => {
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings"), {
          ...securitySettings,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        window.localStorage.setItem("morali_security_settings", JSON.stringify(securitySettings));
      }
    } else {
      window.localStorage.setItem("morali_security_settings", JSON.stringify(securitySettings));
    }
    setSecurityModalOpen(false);
    showToast("Sécurité et biométrie mises à jour");
  };

  const openPrivacyModal = () => {
    setPrivacySaveState("idle");
    setPrivacyAccessLogOpen(false);
    setPrivacyModalOpen(true);
  };

  const closePrivacyModal = () => {
    const hasUnsaved = JSON.stringify(privacySettings) !== JSON.stringify(savedPrivacySettings);
    if (hasUnsaved) {
      setPrivacyCloseConfirmOpen(true);
      return;
    }
    setPrivacyAccessLogOpen(false);
    setPrivacyModalOpen(false);
  };

  const discardPrivacyChanges = () => {
    setPrivacySettings(savedPrivacySettings);
    setPrivacyAccessLogOpen(false);
    setPrivacyCloseConfirmOpen(false);
    setPrivacyModalOpen(false);
  };

  const cancelPrivacyClose = () => {
    setPrivacyCloseConfirmOpen(false);
  };

  const savePrivacySettings = async () => {
    setPrivacySaveState("saving");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("morali_privacy_settings", JSON.stringify(privacySettings));
    }
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "privacySettings"), {
          ...privacySettings,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        console.error("Erreur sauvegarde confidentialité Firestore");
      }
    }
    setSavedPrivacySettings(privacySettings);
    window.setTimeout(() => {
      setPrivacySaveState("saved");
      window.setTimeout(() => {
        setPrivacyModalOpen(false);
        setPrivacyAccessLogOpen(false);
        setPrivacySaveState("idle");
        showToast("Paramètres de confidentialité mis à jour");
      }, 1000);
    }, 800);
  };

  const toggleAmountReveal = (key: string) => {
    if (!privacySettings.activityMasking) return;
    setRevealedAmounts((current) => ({ ...current, [key]: true }));
    window.setTimeout(() => {
      setRevealedAmounts((current) => ({ ...current, [key]: false }));
    }, 3000);
  };

  const openAccessLog = () => {
    setPrivacyAccessLogOpen((current) => !current);
  };

  const disconnectOtherDevices = () => {
    setPrivacyAccessLogOpen(false);
    showToast("Tous les autres appareils ont été déconnectés");
  };

  const openReceiptsModal = () => {
    setReceiptsOpen(true);
  };

  const closeReceiptsModal = () => {
    setReceiptsOpen(false);
  };

  const openSupportModal = () => {
    setSupportOpen(true);
  };

  const closeSupportModal = () => {
    setSupportOpen(false);
    setSupportMessage("");
  };

  const openTermsModal = () => {
    setTermsOpen(true);
  };

  const closeTermsModal = () => {
    setTermsOpen(false);
  };

  /** Enregistre l'acceptation d'un document légal dans Firestore */
  const recordLegalAcceptance = async (type: "terms" | "privacy", version?: string) => {
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) return;
      await fetch("/api/legal/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, version }),
      });
    } catch {
      // Silent — l'acceptation est un best-effort, on ne bloque pas l'utilisateur
    }
  };

  const handleAcceptTerms = () => {
    recordLegalAcceptance("terms", "2.0");
    closeTermsModal();
    showToast("Conditions acceptées ✓");
  };

  const handleAcceptPrivacy = () => {
    recordLegalAcceptance("privacy", "2.0");
    closePrivacyModal();
    showToast("Politique de confidentialité acceptée ✓");
  };

  const openVirtualCardModal = async () => {
    setVirtualCardOpen(true);
    if (!authUid) return;
    setVirtualCardLoading(true);
    try {
      const cardRef = doc(firebaseDb, "users", authUid, "meta", "virtualCard");
      const snap = await getDoc(cardRef);
      if (snap.exists()) {
        setVirtualCardData(snap.data() as VirtualCardDoc);
      } else {
        setVirtualCardData(null);
      }
    } finally {
      setVirtualCardLoading(false);
    }
  };

  const closeVirtualCardModal = () => {
    setVirtualCardOpen(false);
  };

  const openBlackCardModal = async () => {
    setBlackCardOpen(true);
    setBlackCardStep("preview");
    if (!authUid) return;
    setBlackCardLoading(true);
    try {
      const cardRef = doc(firebaseDb, "users", authUid, "meta", "blackCard");
      const snap = await getDoc(cardRef);
      if (snap.exists()) {
        setBlackCardData(snap.data() as BlackCardDoc);
      } else {
        setBlackCardData({
          tier: "black",
          eligible: true,
          status: "none",
          provider: "Visa Infinite",
          spendingLimit: 1500000,
          monthlyLimit: 10000000,
          concierge: true,
          loungeAccess: true,
          prioritySupport: true,
          cashbackRate: 2.5,
        });
      }
    } finally {
      setBlackCardLoading(false);
    }
  };

  const closeBlackCardModal = () => {
    setBlackCardOpen(false);
  };

  const requestBlackCard = async () => {
    if (!authUid) {
      showToast("Connexion requise");
      return;
    }
    setBlackCardLoading(true);
    const payload: BlackCardDoc = {
      tier: "black",
      eligible: true,
      status: "requested",
      provider: "Visa Infinite",
      spendingLimit: 1500000,
      monthlyLimit: 10000000,
      concierge: true,
      loungeAccess: true,
      prioritySupport: true,
      cashbackRate: 2.5,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(
        doc(firebaseDb, "users", authUid, "meta", "blackCard"),
        {
          ...payload,
          material: blackCardMaterial,
        },
        { merge: true },
      );
      setBlackCardData(payload);
      setBlackCardCelebrationOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([20, 40, 20]);
      }
    } catch {
      showToast("Demande Carte Black impossible");
    } finally {
      setBlackCardLoading(false);
    }
  };

  const activateVirtualCard = async () => {
    if (!authUid) {
      showToast("Connexion requise");
      return;
    }
    setVirtualCardLoading(true);
    try {
      const seed = getIdentitySeed(loginEmail || bankingIdentity.id || authUid, authUid).replace(/[^A-Za-z0-9]/g, "");
      const digits = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0).toString().padStart(8, "0");
      const number = `4482 ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(-4)}`;
      const card: VirtualCardDoc = {
        number,
        expiry: "09/28",
        cvv: digits.slice(-3),
        active: true,
        onlineOnly: true,
        frozen: false,
        alias: "Morali Virtual Blue",
        spendingLimit: 250000,
        provider: "Visa",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), card, { merge: true });
      setVirtualCardData(card);
      showToast("Carte virtuelle activée");
    } catch {
      showToast("Activation de la carte virtuelle impossible");
    } finally {
      setVirtualCardLoading(false);
    }
  };

  const exportReceipts = async () => {
    const source = liveTransactions.length ? liveTransactions : dashboardData.transactions;
    const rows = source
      .map((tx, index) => {
        const receiptLine = tx.receiptId ? ` · Reçu ${tx.receiptId}` : "";
        const statusLine = tx.status ? ` · Statut ${tx.status}` : "";
        const channelLine = tx.channel ? ` · Canal ${tx.channel}` : "";
        return `${index + 1}. ${tx.name} — ${tx.amount} — ${tx.date}${channelLine}${statusLine}${receiptLine}`;
      })
      .join("\n");
    const text = `Historique des reçus Morali Pay\n\n${rows}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Historique des Reçus", text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      showToast("Reçus prêts à partager");
    } catch {
      showToast("Export annulé");
    }
  };

  const submitSupportMessage = async () => {
    const message = supportMessage.trim();
    if (!message) {
      showToast("Décrivez votre demande");
      return;
    }
    setSupportSending(true);
    try {
      if (authUid) {
        await addDoc(collection(firebaseDb, "users", authUid, "supportTickets"), {
          message,
          status: "Ouvert",
          createdAt: serverTimestamp(),
        });
      }
      setSupportThreads((current) => [{ id: `local-${Date.now()}`, message, status: "Ouvert", createdAtLabel: "À l'instant" }, ...current]);
      setSupportMessage("");
      showToast("Demande envoyée au support Morali");
    } catch {
      showToast("Envoi du message impossible pour le moment");
    } finally {
      setSupportSending(false);
    }
  };

  const openManageCardModal = () => {
    setCardManageOpen(true);
  };

  const closeManageCardModal = () => {
    setCardManageOpen(false);
  };

  const openPinModal = async () => {
    // ── ALWAYS re-sync localStorage → ref (fixes same-session PIN creation race) ──
    // The ref is initialized false and only set true in useEffect([],) which runs at mount
    // BEFORE the user creates a PIN during registration.  So after registration the ref
    // stays false even though localStorage was written.  Re-reading localStorage here
    // guarantees correctness for both fresh-page loads AND same-session flows.
    if (typeof window !== "undefined" && window.localStorage.getItem("morali_pin_exists") === "true") {
      cardPinExistsRef.current = true;
    }

    setCardPinOpen(true);
    setCardPinRevealed(false);
    setCardPinPassword("");
    setRevealAccountPw("");
    setCardPinDraft("");
    setCardPinConfirm("");
    setRevealNeedsPin(false);
    setRevealPinRaw("");
    setRevealVerifiedPw("");

    if (cardPinExistsRef.current) {
      // Already verified — show menu immediately
      setCardPinStage("menu");
      return;
    }

    // Fallback: use API endpoint (admin SDK) to check PIN existence — bypasses Firestore rules
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (token) {
        const res = await fetch("/api/pin/exists", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.exists) {
          cardPinExistsRef.current = true;
          setSavedCardPinHash("server-stored");
          window.localStorage.setItem("morali_pin_exists", "true");
          setCardPinStage("menu");
          return;
        }
      }
    } catch { /* API call failed — fall through to setup */ }
    setCardPinStage("setup");
  };

  const closePinModal = () => {
    setCardPinOpen(false);
    setCardPinRevealed(false);
    setCardPinPassword("");
    setCardPinDraft("");
    setCardPinConfirm("");
    setRevealNeedsPin(false);
    setRevealPinRaw("");
    setRevealVerifiedPw("");
    setRevealAccountPw("");
    // Re-sync localStorage → ref before reading (same-session fix)
    if (typeof window !== "undefined" && window.localStorage.getItem("morali_pin_exists") === "true") {
      cardPinExistsRef.current = true;
    }
    setCardPinStage(cardPinExistsRef.current ? "menu" : "setup");
  };

  const saveCardPinCode = async () => {
    if (!/^\d{4}$/.test(cardPinDraft) || cardPinDraft !== cardPinConfirm) {
      showToast("Les codes PIN ne correspondent pas");
      return;
    }
    const user = firebaseAuth.currentUser;
    const pinToSave = cardPinDraft;
    // Send plaintext PIN to server; server hashes with bcrypt
    try {
      // Remove any legacy items
      window.localStorage.removeItem("morali_card_pin");
      window.localStorage.removeItem("morali_card_pin_hash");
      window.localStorage.removeItem("morali_card_pin_salt");
      // Also clear any stale client-encrypted copies (re-encryption will happen on first reveal)
      window.localStorage.removeItem("morali_card_pin_encrypted");
      window.localStorage.removeItem("morali_card_pin_iv");
      setSavedCardPin("••••");
      setSessionPinPlaintext(pinToSave);
      cardPinExistsRef.current = true;
      window.localStorage.setItem("morali_pin_exists", "true");
      setCardPinRevealed(false);
      setCardPinPassword("");

      // Store PIN on server: bcrypt hash + server-side AES encryption (if master key set).
      // Server is source of truth for PIN verification during transactions.
      // Client-side encryption is deferred to the first "reveal" attempt, where
      // the user's password is available for AES-GCM key derivation.
      if (user?.uid) {
        try {
          const token = await user.getIdToken();
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: pinToSave }),
          });
        } catch { /* server store failed — non-critical, will retry on next reveal */ }
      }

      setCardPinStage("menu");
      showToast("Code PIN de la carte enregistré");
    } catch {
      showToast("Erreur lors de l'enregistrement du PIN");
    }
  };

  const revealPinWithPassword = async () => {
    // Rate limiting: max 3 attempts, then 5-minute lockout
    if (revealLockedUntil > Date.now()) {
      const waitSec = Math.ceil((revealLockedUntil - Date.now()) / 1000);
      showToast(`Trop de tentatives. Réessayez dans ${waitSec}s`);
      return;
    }
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) {
      showToast("Aucun compte connecté");
      return;
    }
    if (!revealAccountPw.trim()) {
      showToast("Entrez votre mot de passe");
      return;
    }
    setRevealVerifying(true);
    try {
      // Step 1: Firebase re-authentication
      const credential = EmailAuthProvider.credential(user.email, revealAccountPw.trim());
      await reauthenticateWithCredential(user, credential);
      const uid = user.uid;
      const verifiedPw = revealAccountPw.trim();

      // Step 2: Try to decrypt PIN — try all available sources
      let decrypted: string | null = null;

      // 2a. Try server-side PIN reveal (new format — encrypted with server key)
      // IMPORTANT: forceRefresh=true ensures a fresh token with recent iat,
      // because /api/pin/reveal rejects tokens older than 60 seconds.
      try {
        const token = await user.getIdToken(true);
        const revealRes = await fetch("/api/pin/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        if (revealRes.ok) {
          const revealData = await revealRes.json();
          if (revealData.success && revealData.pin && /^\d{4}$/.test(revealData.pin)) {
            decrypted = revealData.pin;
          } else if (revealData.encryptedPin) {
            decrypted = await decryptPinWithPassword(revealData.encryptedPin, verifiedPw, uid);
          }
        }
      } catch { /* server reveal failed, continue to fallback */ }

      // 2b. Fallback: try localStorage encrypted PIN (most reliable for fresh accounts)
      if (!decrypted) {
        const localEncrypted = window.localStorage.getItem("morali_card_pin_encrypted");
        if (localEncrypted) {
          try {
            decrypted = await decryptPinWithPassword(localEncrypted, verifiedPw, uid);
            if (decrypted) console.log("[PIN reveal] Decrypted from localStorage");
          } catch (decErr) {
            console.error("[PIN reveal] localStorage decrypt error:", decErr);
          }
        } else {
          console.warn("[PIN reveal] No morali_card_pin_encrypted in localStorage");
        }
      }

      // 2c. Fallback: try get-encrypted endpoint
      if (!decrypted) {
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/pin/get-encrypted", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data.hasEncrypted && data.encryptedPin) {
            decrypted = await decryptPinWithPassword(data.encryptedPin, verifiedPw, uid);
          }
        } catch { /* all server methods failed */ }
      }

      if (decrypted && /^\d{4}$/.test(decrypted)) {
        // PIN successfully decrypted — show it!
        setRevealedPinDigits(decrypted.split("").join(" "));
        setCardPinRevealed(true);
        setRevealAttempts(0);
        setRevealLockedUntil(0);
        setRevealAccountPw("");
        setRevealNeedsPin(false);
        setRevealPinRaw("");
        setRevealVerifiedPw("");
        setSessionPinPlaintext(decrypted);
        // Also store server-encrypted version for future fast reveals
        try {
          const token = await user.getIdToken();
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: decrypted }),
          });
        } catch { /* non-critical */ }
        showToast("Code PIN affiché");
        return;
      }

      // Step 3: Last resort — ask user to enter PIN for one-time migration
      setRevealVerifiedPw(verifiedPw);
      setRevealAccountPw("");
      setRevealNeedsPin(true);
      setRevealPinRaw("");
      showToast("Saisissez votre PIN pour confirmer votre identité.");
    } catch (err: unknown) {
      const code = err instanceof Error ? (err as { code?: string }).code || "" : "";
      const newAttempts = revealAttempts + 1;
      setRevealAttempts(newAttempts);
      if (code === "auth/too-many-requests") {
        setRevealLockedUntil(Date.now() + 5 * 60 * 1000);
        showToast("Trop de requêtes Firebase. Verrouillé pendant 5 minutes.");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        if (newAttempts >= 3) {
          setRevealLockedUntil(Date.now() + 5 * 60 * 1000);
          showToast("Trop de tentatives. Verrouillé pendant 5 minutes.");
        } else {
          showToast(`Mot de passe incorrect (${3 - newAttempts} tentative(s) restante(s))`);
        }
      } else if (code === "auth/network-request-failed") {
        showToast("Erreur réseau. Vérifiez votre connexion et réessayez.");
      } else {
        showToast(`Erreur de vérification. ${code ? `[${code}]` : ""} Réessayez.`);
      }
      setRevealAccountPw("");
    } finally {
      setRevealVerifying(false);
    }
  };

  // ── Encrypt existing PIN with verified password then reveal ──
  const encryptAndRevealPin = async () => {
    if (!/^\d{4}$/.test(revealPinRaw)) {
      showToast("Entrez un code PIN à 4 chiffres");
      return;
    }
    const user = firebaseAuth.currentUser;
    if (!user) return;
    setRevealPinVerifying(true);
    try {
      // Verify PIN against server hash, fallback to client Firestore
      let pinValid = false;
      try {
        const token = await user.getIdToken();
        const pinRes = await fetch("/api/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: revealPinRaw }),
        });
        const pinData = await pinRes.json();
        pinValid = !!pinData.valid;
      } catch {
        showToast("Erreur de vérification");
        setRevealPinRaw("");
        setRevealPinVerifying(false);
        return;
      }

      if (!pinValid) {
        showToast("Code PIN incorrect");
        setRevealPinRaw("");
        setRevealPinVerifying(false);
        return;
      }
      // PIN is correct — encrypt it with verified password + store server-side encrypted version
      const uid = user.uid;
      const encrypted = await encryptPinWithPassword(revealPinRaw, revealVerifiedPw, uid);
      window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
      window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
      // Store on server: bcrypt already exists, add server-encrypted + client-encrypted versions
      try {
        const token = await user.getIdToken();
        await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: revealPinRaw, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
        });
      } catch { /* server store failed, localStorage is enough */ }
      // Show PIN
      setRevealedPinDigits(revealPinRaw.split("").join(" "));
      setCardPinRevealed(true);
      setRevealNeedsPin(false);
      setRevealPinRaw("");
      setRevealVerifiedPw("");
      setSessionPinPlaintext(revealPinRaw);
      showToast("PIN chiffré et affiché avec succès !");
    } catch {
      showToast("Erreur lors du chiffrement");
    } finally {
      setRevealPinVerifying(false);
    }
  };

  const changeCardPinCode = async () => {
    if (!/^\d{4}$/.test(cardPinPassword) || !/^\d{4}$/.test(cardPinDraft) || cardPinDraft !== cardPinConfirm) {
      showToast("Vérifiez les codes PIN");
      return;
    }
    // Verify old PIN via server (client-side state may be empty after reload)
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const pinRes = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: cardPinPassword }),
      });
      const pinData = await pinRes.json();
      if (!pinData.valid) {
        showToast("Ancien code PIN incorrect");
        return;
      }
      // Save new PIN (server hashes with bcrypt)
      setSavedCardPin("••••");
      setSessionPinPlaintext(cardPinDraft);
      cardPinExistsRef.current = true;
      window.localStorage.setItem("morali_pin_exists", "true");
      // Encrypt new PIN with account password if provided (for future reveal)
      if (changePinAccountPw.trim() && firebaseAuth.currentUser?.uid) {
        try {
          const encrypted = await encryptPinWithPassword(cardPinDraft, changePinAccountPw.trim(), firebaseAuth.currentUser.uid);
          window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
          window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: cardPinDraft, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
          });
        } catch { /* encryption failed, store without encrypted version */ }
      } else {
        // Store without encryption (PIN reveal won't work but PIN verification will)
        try {
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: cardPinDraft }),
          });
        } catch { /* server store failed */ }
      }
      // Server is source of truth for PIN hash (bcrypt)
      setCardPinRevealed(false);
      setRevealedPinDigits("");
      setCardPinPassword("");
      setCardPinDraft("");
      setCardPinConfirm("");
      setChangePinAccountPw("");
      setCardPinStage("menu");
      showToast("Code PIN mis à jour");
    } catch {
      showToast("Erreur lors de la mise à jour");
    }
  };

  // ── PIN Reset via Email OTP ──
  const sendPinResetOtp = async () => {
    const user = firebaseAuth.currentUser;
    if (!user?.email) {
      showToast("Aucun email associé à ce compte");
      return;
    }
    setPinResetSending(true);
    setPinResetDemoOtp("");
    setPinResetOtpCode("");
    try {
      const res = await fetch("/api/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (data.success) {
        setPinResetOtpSent(true);
        if (data.demoOtp) {
          setPinResetDemoOtp(data.demoOtp);
        }
        showToast(data.demoMode ? "Code de test généré (mode démo)" : "Code envoyé par email");
      } else {
        showToast(data.error || "Erreur d'envoi du code");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    } finally {
      setPinResetSending(false);
    }
  };

  const verifyPinResetOtp = async () => {
    const user = firebaseAuth.currentUser;
    if (!user?.email) return;
    if (pinResetOtpCode.length !== 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
    setPinResetVerifying(true);
    try {
      const res = await fetch("/api/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, code: pinResetOtpCode }),
      });
      const data = await res.json();
      if (data.valid) {
        setPinResetVerified(true);
        showToast("Email vérifié ! Créez votre nouveau code PIN.");
      } else {
        showToast(data.error || "Code incorrect");
      }
    } catch {
      showToast("Erreur de vérification");
    } finally {
      setPinResetVerifying(false);
    }
  };

  const resetPinWithNewCode = async () => {
    if (!/^\d{4}$/.test(pinResetNewPin) || pinResetNewPin !== pinResetConfirmPin) {
      showToast("Les codes PIN ne correspondent pas");
      return;
    }
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) {
        showToast("Non autorisé");
        return;
      }
      // Save new PIN via reset endpoint (server hashes with bcrypt)
      const res = await fetch("/api/pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: pinResetNewPin }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state
        setSavedCardPin("••••");
        setSessionPinPlaintext(pinResetNewPin);
        cardPinExistsRef.current = true;
        window.localStorage.setItem("morali_pin_exists", "true");
        // Server is source of truth for PIN hash (bcrypt)
        // Reset state and go to menu
        resetPinResetState();
        setCardPinStage("menu");
        showToast("Code PIN réinitialisé avec succès");
      } else {
        showToast(data.error || "Erreur de réinitialisation");
      }
    } catch {
      showToast("Erreur lors de la réinitialisation");
    }
  };

  const resetPinResetState = () => {
    setPinResetOtpSent(false);
    setPinResetOtpCode("");
    setPinResetDemoOtp("");
    setPinResetVerified(false);
    setPinResetNewPin("");
    setPinResetConfirmPin("");
    setPinResetSending(false);
    setPinResetVerifying(false);
  };

  const saveCardSettings = async () => {
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "cardSettings"), {
          ...cardSettings,
          locked: cardLocked,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        // Fallback: save locally
        window.localStorage.setItem("morali_card_settings", JSON.stringify({ ...cardSettings, locked: cardLocked }));
      }
    } else {
      window.localStorage.setItem("morali_card_settings", JSON.stringify({ ...cardSettings, locked: cardLocked }));
    }
    setCardManageOpen(false);
    showToast("Paramètres carte mis à jour");
  };

  /* ── Registration PIN Setup ── */
  const handleRegPinDraftChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setRegPinDraft(digits);
  };

  const handleRegPinConfirmChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setRegPinConfirm(digits);
  };

  const handleRegPinBack = () => {
    setRegPinStep("create");
    setRegPinDraft("");
    setRegPinConfirm("");
  };

  const handleRegPinSave = async () => {
    if (regPinDraft.length !== 4 || regPinConfirm.length !== 4) {
      showToast("Entrez un code PIN à 4 chiffres");
      return;
    }
    if (regPinDraft !== regPinConfirm) {
      showToast("Les codes PIN ne correspondent pas. Réessayez.");
      setRegPinStep("create");
      setRegPinDraft("");
      setRegPinConfirm("");
      return;
    }
    setRegPinSaving(true);
    try {
      // Send plaintext PIN to server; server hashes with bcrypt
      window.localStorage.removeItem("morali_card_pin");
      window.localStorage.removeItem("morali_card_pin_hash");
      window.localStorage.removeItem("morali_card_pin_salt");
      setSavedCardPin("••••");
      setSessionPinPlaintext(regPinDraft); // Store in memory for reveal
      cardPinExistsRef.current = true;
      window.localStorage.setItem("morali_pin_exists", "true");
      // Encrypt PIN with account password for later reveal
      const encrypted = await encryptPinWithPassword(regPinDraft, registerData.pw, firebaseAuth.currentUser?.uid || "");
      window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
      window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
      // Store plaintext PIN + encrypted version on server
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: regPinDraft, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
        });
      } catch { /* server store failed */ }
      // Server is source of truth for PIN hash (bcrypt)
      // Clear registration PIN states and go to success
      setShowPinSetup(false);
      setRegPinDraft("");
      setRegPinConfirm("");
      setRegPinStep("create");
      setShowRegisterSuccess(true);
      cardPinExistsRef.current = true;
      showToast("Code PIN créé avec succès");
    } catch {
      showToast("Erreur lors de la création du PIN");
    } finally {
      setRegPinSaving(false);
    }
  };

  const openCardLimitsModal = () => {
    setCardLimitsOpen(true);
  };

  const closeCardLimitsModal = () => {
    setCardLimitsOpen(false);
  };

  const addNewContact = () => {
    setContactQuery("");
    setVerifiedMoraliUser(null);
    setContactSearchLoading(false);
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setContactQuery("");
    setVerifiedMoraliUser(null);
    setContactSearchLoading(false);
  };

  const confirmAddNewContact = () => {
    if (!verifiedMoraliUser) {
      showToast("Aucun compte Morali vérifié trouvé");
      return;
    }
    setPaymentContacts((current) => {
      const exists = current.some((contact) => contact.name.toLowerCase() === verifiedMoraliUser.name.toLowerCase());
      if (exists) return current;
      return [{ name: verifiedMoraliUser.name, tone: verifiedMoraliUser.tone }, ...current];
    });
    showToast(`${verifiedMoraliUser.name} ajouté aux favoris`);
    closeContactModal();
  };

  // Dead code removed

  const goToStep = async (step: number) => {
    if (step === 2) {
      const { prenom, nom, email, tel } = registerData;
      if (!prenom.trim() || !nom.trim() || !email.trim() || !tel.trim()) {
        showToast("Remplissez tous les champs");
        return;
      }
      if (!email.includes("@")) {
        showToast("Email invalide");
        return;
      }
      setCurrentStep(2);
      return;
    }

    if (step === 3) {
      if (registerData.pw.length < 8) {
        showToast("Mot de passe trop court (8 min)");
        return;
      }
      if (registerData.pw !== confirmPassword) {
        showToast("Les mots de passe ne correspondent pas");
        return;
      }
      if (!termsAccepted) {
        showToast("Acceptez les conditions générales");
        return;
      }
      setOtpValue("");
      // Send OTP when moving to verification step
      try {
        const phone = `${registerData.prefix}${registerData.tel}`;
        const res = await fetch("/api/sms/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.demoOtp) {
            setDemoOtpCode(data.demoOtp);
          }
        } else {
          showToast(data.error || "Erreur d'envoi du code");
          return;
        }
      } catch {
        showToast("Erreur d'envoi du code");
        return;
      }
      setCurrentStep(3);
      return;
    }

    if (step === 1 || step === 2) {
      setCurrentStep(step);
    }
  };

  const handleVerify = async () => {
    if (otpValue.length < 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
    // Verify OTP via API
    try {
      const phone = `${registerData.prefix}${registerData.tel}`;
      const res = await fetch("/api/sms/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otpValue }),
      });
      const data = await res.json();
      if (!data.valid) {
        showToast(data.error || "Code de vérification incorrect");
        return;
      }
    } catch {
      showToast("Erreur de vérification");
      return;
    }

    setVerifyLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, registerData.email.trim(), registerData.pw);
      const normalizedFullName = `${registerData.prenom} ${registerData.nom}`.trim();
      const immediateIdentity = generateMoraliIdentity(getIdentitySeed(cred.user.email, cred.user.uid));
      setBankingIdentity(immediateIdentity);
      cacheIdentityForUid(cred.user.uid, immediateIdentity);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("morali_profile_full_name", normalizedFullName);
        window.localStorage.setItem("morali_profile_phone", `${registerData.prefix} ${registerData.tel}`.trim());
      }
      setProfileForm((current) => ({
        ...current,
        fullName: normalizedFullName,
        phone: `${registerData.prefix} ${registerData.tel}`.trim(),
      }));
      setDashboardName(normalizedFullName || registerData.prenom);

      try {
        const createdIdentity = await persistMoraliProfile(cred.user.uid);
        if (createdIdentity) {
          setBankingIdentity(createdIdentity);
        }
      } catch {
        showToast("Compte créé. Synchronisation du profil en attente.");
      }

      setShowPinSetup(true);
    } catch (error) {
      const message = firebaseAuthMessage(error);
      showToast(message || "Création du compte impossible");
    } finally {
      setVerifyLoading(false);
    }
  };

  const enterDashboard = (nameOverride?: string) => {
    const fallbackFromEmail = loginEmail ? `${loginEmail.split("@")[0].charAt(0).toUpperCase()}${loginEmail.split("@")[0].slice(1)}` : "";
    const savedFullName = typeof window !== "undefined" ? window.localStorage.getItem("morali_profile_full_name") || "" : "";
    const nextName = nameOverride || savedFullName || profileForm.fullName || registerData.prenom || fallbackFromEmail || "Utilisateur";
    setDashboardName(nextName);
    setScreen("dashboard");
    showToast(`Bienvenue ${nextName}`);
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast("Remplissez tous les champs");
      return;
    }
    if (!loginEmail.includes("@")) {
      showToast("Email invalide");
      return;
    }
    setLoginLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, loginEmail.trim(), loginPassword);
      // Charger le profil depuis Firestore pour récupérer le vrai nom/prénom
      try {
        const profileSnap = await getDoc(doc(firebaseDb, "moraliUsers", cred.user.uid));
        if (profileSnap.exists()) {
          const data = profileSnap.data() as FirestoreMoraliUser;
          const firestoreName = data.fullName || `${data.firstName} ${data.lastName}`.trim() || "";
          const firebaseName = cred.user.displayName || "";
          const emailName = loginEmail ? loginEmail.split("@")[0] : "";
          const emailCapitalized = emailName ? `${emailName.charAt(0).toUpperCase()}${emailName.slice(1)}` : "";
          const fullName = firestoreName || firebaseName || emailCapitalized || "";
          if (fullName) {
            window.localStorage.setItem("morali_profile_full_name", fullName);
            setProfileForm((prev) => ({ ...prev, fullName }));
            enterDashboard(fullName);
          } else {
            enterDashboard();
          }
          // Auto-repair: save derived name to Firestore if missing
          if (!data.fullName && !data.firstName && fullName) {
            updateDoc(doc(firebaseDb, "moraliUsers", cred.user.uid), {
              firstName: fullName.split(" ")[0] || "",
              lastName: fullName.split(" ").slice(1).join(" ") || "",
              fullName,
            }).catch(() => {});
          }
        } else {
          // No Firestore doc yet — use email-based name
          const emailName = loginEmail ? loginEmail.split("@")[0] : "";
          const emailCapitalized = emailName ? `${emailName.charAt(0).toUpperCase()}${emailName.slice(1)}` : "";
          enterDashboard(emailCapitalized || undefined);
        }
      } catch {
        enterDashboard();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible";
      showToast(message.includes("invalid-credential") ? "Email ou mot de passe incorrect" : "Connexion impossible");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgot = () => {
    setForgotEmail(loginEmail.trim());
    setForgotOtpCode("");
    setForgotDemoOtp("");
    setForgotSending(false);
    setForgotVerifying(false);
    setForgotVerified(false);
    setForgotNewPw("");
    setForgotConfirmPw("");
    setForgotResetting(false);
    setForgotStep("email");
    setAuthTab("forgot");
  };

  // Dead code removed

  // Dead code removed

  const handleSocialLogin = async (provider: string) => {
    if (provider !== "Google") {
      showToast(`Connexion ${provider} indisponible`);
      return;
    }

    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });

    const isMobileLike = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

    try {
      if (isMobileLike) {
        await signInWithRedirect(firebaseAuth, googleProvider);
        return;
      }

      const cred = await signInWithPopup(firebaseAuth, googleProvider);
      const user = cred.user;
      const displayName = (user.displayName || "Utilisateur Morali").trim();
      const parts = displayName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || "Utilisateur";
      const lastName = parts.slice(1).join(" ") || "Morali";
      const pseudoBase = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "") || user.uid.slice(0, 8).toLowerCase();
      const identity = generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
      const phone = profileForm.phone.trim() || `${registerData.prefix || "+242"}${registerData.tel || ""}`;

      await setDoc(
        doc(firebaseDb, "moraliUsers", user.uid),
        {
          uid: user.uid,
          fullName: displayName,
          firstName,
          lastName,
          pseudo: pseudoBase,
          moraliId: identity.id,
          moraliIdNormalized: identity.id.replace(/[^A-Z0-9]/g, ""),
          rib: identity.rib,
          phone,
          email: user.email || "",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Publish directory entry for Google login users
      await publishDirectoryEntry(user.uid, { fullName: displayName, firstName, lastName, pseudo: `@${pseudoBase}`, moraliId: identity.id });

      cacheIdentityForUid(user.uid, identity);
      setBankingIdentity(identity);
      setDashboardName(displayName);
      setProfileForm((prev) => ({
        ...prev,
        fullName: displayName,
        phone: prev.phone || phone,
        address: prev.address || "Brazzaville, Congo",
      }));
      setLoginEmail(user.email || "");
      setAuthTab("login");
      setScreen("dashboard");
      setNavActive("Accueil");
      showToast("Connexion Google réussie");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion Google impossible";
      showToast(message);
    }
  };

  const handleOtpChange = (value: string) => {
    setOtpValue(value.replace(/\D/g, "").slice(0, 6));
  };

  const resendOtp = async () => {
    setOtpValue("");
    setDemoOtpCode("");
    try {
      const phone = `${registerData.prefix}${registerData.tel}`;
      const res = await fetch("/api/sms/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Nouveau code envoyé !");
        if (data.demoOtp) {
          setDemoOtpCode(data.demoOtp);
        }
      } else {
        showToast(data.error || "Erreur d'envoi");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    }
    window.setTimeout(() => otpInputRef.current?.focus(), 150);
  };

  const handleCardMove = (clientX: number, clientY: number, rect: DOMRect) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (clientX - cx) / (rect.width / 2);
    const dy = (clientY - cy) / (rect.height / 2);
    setCardTransform(`rotateX(${(-dy * 9).toFixed(2)}deg) rotateY(${(dx * 7).toFixed(2)}deg) scale(1.02)`);
  };

  const activeCardNumber = customCardData?.cardNumber || dashboardData.cardNumber;
  const activeCardCcv = customCardData?.cardCcv || dashboardData.cardCcv;
  const activeCardExp = customCardData?.cardExp || dashboardData.cardExp;

  const maskCardNumber = (num: string) => {
    const parts = num.split(" ");
    if (parts.length === 4) return `${parts[0]} •••• •••• ${parts[3]}`;
    return num;
  };

  const toggleCardNumberReveal = () => {
    if (cardNumberRevealed) {
      setCardNumberRevealed(false);
    } else {
      setCardNumberRevealed(true);
      setTimeout(() => setCardNumberRevealed(false), 10000);
    }
  };

  const generateCardNumber = () => {
    const blocks = Array.from({ length: 4 }, () => String(1000 + Math.floor(Math.random() * 9000)));
    return `${blocks[0]} ${blocks[1]} ${blocks[2]} ${blocks[3]}`;
  };

  const handleCardGenerate = () => {
    if (cardGenerating) return;
    setCardGenerating(true);
    setTimeout(() => {
      const newNumber = generateCardNumber();
      const newCcv = String(100 + Math.floor(Math.random() * 900));
      const newExpMonth = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
      const newExpYear = String(28 + Math.floor(Math.random() * 5));
      setCustomCardData({ cardNumber: newNumber, cardCcv: newCcv, cardExp: `${newExpMonth}/${newExpYear}` });
      setCardGenerating(false);
      setCardLocked(false);
      setCardNumberRevealed(false);
      showToast("Nouvelle carte générée avec succès");
    }, 1800);
  };

  const openPaymentsTab = () => {
    setScreen("payments");
  };

  const openCardsTab = () => {
    setScreen("cards");
    setNavActive("Cartes");
  };

  const openPrivilegesTab = () => {
    setScreen("privileges");
    setNavActive("Privilèges");
  };

  const openProfileTab = () => {
    setScreen("profile");
    setNavActive("Profil");
  };

  const openDashboard = () => {
    setScreen("dashboard");
    setNavActive("Accueil");
  };

  const openTransaction = (type: TransactionType) => {
    setTransactionType(type);
    setTransactionReturnScreen(screen);
    setScreen("transaction");
  };

  const openServices = () => {
    setScreen("services");
    setNavActive("Accueil");
  };

  const openMerchant = () => {
    setScreen("merchant");
    setNavActive("Accueil");
  };

  const openFromSearch = (id: string) => {
    if (id === "credit") {
      openAirtimeData();
      return;
    }
    if (id === "internet") {
      openInternet();
      return;
    }
    if (id === "canal") {
      openCanalPlus();
      return;
    }
    if (id === "merchant") {
      openMerchant();
      return;
    }
    if (id === "crypto") {
      openCrypto();
      return;
    }
    if (id === "loan") {
      openMicroCredit();
      return;
    }
    if (id === "personalloan") {
      openPersonalLoan();
      return;
    }
    if (id === "currency") {
      openCurrency();
      return;
    }
    if (id === "tontine") {
      openTontine();
      return;
    }
    if (id === "savings") {
      openSavings();
      return;
    }
    if (id === "utility-elec") {
      openElectricity();
      return;
    }
    if (id === "utility-water") {
      openWater();
      return;
    }
    if (id === "wallet") {
      openWallet();
      return;
    }
  };

  const openSavings = () => {
    setScreen("savings");
    setNavActive("Accueil");
  };

  const openMicroCredit = () => {
    setScreen("microcredit");
    setNavActive("Accueil");
  };

  const openPersonalLoan = () => {
    setScreen("personalloan");
    setNavActive("Accueil");
  };

  const openWallet = () => {
    setScreen("wallet");
    setNavActive("Accueil");
  };

  const openCurrency = () => {
    setScreen("currency");
    setNavActive("Accueil");
  };

  const openEurWallet = () => {
    setScreen("eurWallet");
    setNavActive("Accueil");
  };

  const openUsdWallet = () => {
    setScreen("usdWallet");
    setNavActive("Accueil");
  };

  const openAirtimeData = () => {
    setScreen("credit");
    setNavActive("Accueil");
  };

  const openInternet = () => {
    setScreen("internet");
    setNavActive("Accueil");
  };

  const openCanalPlus = () => {
    setScreen("canalplus");
    setNavActive("Accueil");
  };

  const openElectricity = () => {
    setScreen("electricity");
    setNavActive("Accueil");
  };

  const openWater = () => {
    setScreen("water");
    setNavActive("Accueil");
  };

  const openTontine = () => {
    setScreen("tontine");
    setNavActive("Accueil");
  };

  const openCrypto = () => {
    setScreen("crypto");
    setNavActive("Accueil");
  };

  const closeServices = () => {
    setScreen("dashboard");
    setNavActive("Accueil");
  };

  const closeHub = () => {
    setScreen("services");
    setNavActive("Accueil");
  };

  const resetTransactionFlow = () => {
    setTransactionChoiceOpen(false);
    setTransactionPinOpen(false);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
  };

  const closeTransaction = () => {
    resetTransactionFlow();
    setScreen(transactionReturnScreen);
  };

  const validateTransactionFields = () => {
    if (!transactionAmount || transactionNumericAmount <= 0) {
      showToast("Entrez un montant valide");
      return false;
    }

    const digits = transactionPhone.replace(/\D/g, "");
    if (!/^(06|05)\d{7}$/.test(digits)) {
      showToast("Le numéro doit contenir 9 chiffres et commencer par 06 ou 05");
      return false;
    }

    return true;
  };

  const openTransactionChoice = () => {
    if (!validateTransactionFields()) return;
    openTransactionPinDirect();
  };

  const closeTransactionChoice = () => {
    setTransactionChoiceOpen(false);
  };

  const openTransactionPin = () => {
    setTransactionPinOpen(true);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
    setTransactionPinVerifying(false);
  };

  const closeTransactionPin = () => {
    setTransactionPinOpen(false);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
    setTransactionPinVerifying(false);
    setPendingPinAction(null);
  };

  // Destination is always "cash" (airtime/credit d'appel removed)
  const openTransactionPinDirect = () => {
    setTransactionChoiceOpen(false);
    openTransactionPin();
  };

  const executeTransaction = async () => {
    setTransactionProcessing(true);
    try {
      const receiptId = `TX-${Date.now().toString().slice(-8)}`;
      if (authUid) {
        const userRef = doc(firebaseDb, "moraliUsers", authUid);

        // Pre-flight: check suspension
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().accountStatus === "suspended") {
          showToast("Votre compte est suspendu. Opération impossible.");
          setTransactionProcessing(false);
          return;
        }

        // Operator limit checks (retrait only)
        if (transactionType === "retrait") {
          const limits = OPERATOR_LIMITS[transactionMethod].retrait;
          const opLabel = limits.label;
          if (transactionNumericAmount > limits.daily) {
            showToast(`Limite journalière ${opLabel} : ${formatCurrency(limits.daily)} FCFA`);
            setTransactionProcessing(false);
            return;
          }
          if (transactionNumericAmount > limits.monthly) {
            showToast(`Limite mensuelle ${opLabel} : ${formatCurrency(limits.monthly)} FCFA`);
            setTransactionProcessing(false);
            return;
          }
        }

        // Pre-flight balance check (retrait only)
        if (transactionType === "retrait") {
          const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
          if ((transactionNumericAmount + fees) > userBal) {
            showToast("Solde insuffisant pour ce retrait");
            setTransactionProcessing(false);
            return;
          }
        }

        // Atomic balance check + update via runTransaction
        const balanceDelta = transactionType === "depot"
          ? transactionNumericAmount - fees  // Net received after fees
          : -(transactionNumericAmount + fees);  // Gross debited including fees
        await runTransaction(firebaseDb, async (tx) => {
          const userDoc = await tx.get(userRef);
          if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
          const currentBal = userDoc.data().balance || 0;
          if (transactionType === "retrait" && (transactionNumericAmount + fees) > currentBal) {
            throw new Error("INSUFFICIENT_BALANCE");
          }
          tx.update(userRef, { balance: currentBal + balanceDelta, updatedAt: serverTimestamp() });
        });

        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: transactionNumericAmount, fees,
          type: transactionType, destination: transactionDestination || "cash", status: "success", receiptId,
        });
        try {
          const netAmount = transactionType === "depot" ? transactionNumericAmount - fees : transactionNumericAmount + fees;
          await createRealtimeNotification(authUid, {
            title: `${transactionType === "depot" ? "Dépôt" : "Retrait"} confirmé — FCFA ${formatCurrency(transactionNumericAmount)}`,
            time: "À l'instant", badge: transactionType === "depot" ? `+${formatCurrency(netAmount)}` : `-${formatCurrency(netAmount)}`,
            badgeClass: transactionType === "depot" ? "nb-green" : "nb-blue",
            icon: transactionType === "depot" ? "wallet" : "receive",
            bg: transactionType === "depot" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)", read: false,
          });
        } catch { /* notification best-effort */ }

        // ── Track bank revenue for withdrawals (2% fee) ──
        if (transactionType === "retrait" && fees > 0) {
          trackBankRevenue("withdrawal_fee", fees, `Frais retrait ${transactionMethod === "mtn" ? "MTN" : "Airtel"} — ${formatCurrency(transactionNumericAmount)} FCFA`);
        }
      }
      window.setTimeout(() => {
        setTransactionProcessing(false);
        setTransactionSuccess(true);
        const destLabel = "Mobile Money";
        const opLabel = transactionMethod === "mtn" ? "MTN" : "Airtel";
        showQuickNotif(
          transactionType === "depot" ? "credit" : "debit",
          `${transactionType === "depot" ? "Dépôt" : "Retrait"} ${destLabel} ${opLabel}`,
          formatCurrency(transactionNumericAmount),
          transactionType === "depot" ? "wallet" : "receive",
          transactionType === "depot" ? "#4ade80" : "#60a5fa"
        );
      }, 1500);
    } catch (err: unknown) {
      setTransactionProcessing(false);
      console.error("[executeTransaction] ERROR:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else if (msg === "USER_NOT_FOUND") showToast("Profil utilisateur introuvable. Veuillez recharger la page.");
      else { showToast("Transaction impossible pour le moment"); }
    }
  };

  const handleTransactionPinKey = async (value: string) => {
    if (transactionProcessing || transactionSuccess) return;

    if (value === "back") {
      setTransactionPin((current) => current.slice(0, -1));
      return;
    }

    if (transactionPin.length >= 4) return;
    const nextPin = `${transactionPin}${value}`.slice(0, 4);
    setTransactionPin(nextPin);

    if (nextPin.length === 4) {
      // ── SERVER-SIDE PIN VERIFICATION ──
      // Prevents PIN bypass via browser DevTools (same pattern as transfer flow)
      if (!cardPinExistsRef.current) {
        // No PIN set — proceed directly (same behavior as transfer flow)
        window.setTimeout(() => executeTransaction(), 120);
        return;
      }
      setTransactionPinVerifying(true);
      try {
        const res = await fetch("/api/verify-pin", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ pin: nextPin }),
        });
        const data = await res.json();
        if (res.status === 429) {
          setTransactionPin("");
          showToast(data.error || "Trop de tentatives");
          setTransactionPinVerifying(false);
          return;
        }
        if (!data.valid) {
          setTransactionPin("");
          showToast("Code PIN incorrect");
          setTransactionPinVerifying(false);
          return;
        }
        // PIN verified — proceed with transaction
        setTransactionPinVerifying(false);
        if (pendingPinAction) {
          const action = pendingPinAction;
          setPendingPinAction(null);
          window.setTimeout(async () => {
            closeTransactionPin();
            if (action.type === "merchant") {
              executeServiceDebit(action.amount, "Paiement Marchand", "qr");
            } else if (action.type === "savings_deposit") {
              executeSavingsTransfer("deposit");
            } else if (action.type === "savings_withdraw") {
              executeSavingsTransfer("withdraw");
            }
          }, 200);
          return;
        }
        window.setTimeout(() => executeTransaction(), 120);
      } catch {
        showToast("Erreur de vérification PIN");
        setTransactionPin("");
        setTransactionPinVerifying(false);
      }
    }
  };

  const finishTransactionFlow = () => {
    const operatorLabel = transactionMethod === "mtn" ? "MTN MoMo" : "Airtel Money";
    const destinationLabel = "Mobile Money";
    const actionLabel = transactionType === "depot" ? "Dépôt" : "Retrait";
    showToast(`${actionLabel} ${destinationLabel} ${operatorLabel} effectué`);
    setTransactionAmount("");
    setTransactionPhone("");
    setTransactionMethod("mtn");
    resetTransactionFlow();
    setScreen(transactionReturnScreen);
  };

  // ── Admin Functions extracted to AdminDashboard.tsx ──

  // Dead code removed

  // Dead code removed

  return (
    <RenderGuard>
    <>
      {!authChecked ? (
        <div className="stage"><div className="app-viewport" style={{ alignItems: "center", justifyContent: "center", color: "white", display: "flex" }}>Chargement sécurisé...</div></div>
      ) : accountSuspended ? (
        <div className="stage">
          <div className="app-viewport" style={{ alignItems: "center", justifyContent: "center", display: "flex", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Compte Suspendu</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 28 }}>{suspensionMessage}</div>
              <button className="btn-secondary" onClick={() => {
                setScreen("auth");
                setAccountSuspended(false);
                signOut(firebaseAuth).catch(() => {});
              }} style={{ maxWidth: 200, margin: "0 auto" }}>Se déconnecter</button>
            </div>
          </div>
        </div>
      ) : (
      <div className="stage">
        <div className="app-viewport">
          {screen === "auth" && (
          <AuthView
            showToast={showToast}
            setScreen={setScreen}
            setNavActive={setNavActive}
            setDashboardName={setDashboardName}
            setProfileForm={setProfileForm}
            setBankingIdentity={setBankingIdentity}
            profileForm={profileForm}
            handleAdminLongPressStart={adminRef.current?.handleAdminLongPressStart || (() => {})}
            handleAdminLongPressEnd={adminRef.current?.handleAdminLongPressEnd || (() => {})}
            onAuthSuccess={() => {}}
            persistMoraliProfile={persistMoraliProfile}
          />
          )}
          {screen === "transaction" && (
            <TransactionsView
              type={transactionType}
              amount={transactionAmount}
              onAmountChange={setTransactionAmount}
              method={transactionMethod}
              onMethodChange={setTransactionMethod}
              phone={transactionPhone}
              onPhoneChange={setTransactionPhone}
              balance={firestoreBalance !== null ? firestoreBalance : dashboardData.balance}
              total={transactionTotal}
              fees={fees}
              onClose={closeTransaction}
              onSubmit={openTransactionChoice}
            />
          )}

          <div className={`app-screen ${screen === "services" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe" style={{ paddingBottom: 200 }}>
              <div className="services-screen">
                <div className="services-header">
                  <div className="services-topbar">
                    <h1 className="services-title">Services</h1>
                    <button className="services-bell" onClick={closeServices} aria-label="Fermer la fenêtre services">
                      <span className="close-x">×</span>
                    </button>
                  </div>

                  <div className="services-search" style={{ zIndex: 20 }}>
                    <span className="search-icon">
                      <AppIcon name="search" size={18} stroke="#64748b" />
                    </span>
                    <input
                      type="text"
                      placeholder="Rechercher un service ou marchand..."
                      value={servicesQuery}
                      onFocus={() => setServicesFocused(true)}
                      onBlur={() => window.setTimeout(() => setServicesFocused(false), 180)}
                      onChange={(e) => setServicesQuery(e.target.value)}
                    />
                    {servicesQuery && (
                      <button
                        type="button"
                        onClick={() => setServicesQuery("")}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#64748b", fontWeight: 800, cursor: "pointer" }}
                        aria-label="Effacer la recherche"
                      >
                        ×
                      </button>
                    )}

                    {servicesFocused && servicesQuery.trim().length > 0 && (
                      <div style={{ position: "absolute", top: 64, left: 0, width: "100%", background: "rgba(22,28,44,.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 28, boxShadow: "0 24px 48px rgba(0,0,0,.35)", overflow: "hidden" }}>
                        {filteredServices.length > 0 && (
                          <div style={{ padding: 16, borderBottom: filteredContacts.length ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                            <p style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 10, padding: "0 8px" }}>Services & Actions</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {filteredServices.map((service) => (
                                <button
                                  key={service.id}
                                  type="button"
                                  onClick={() => { openFromSearch(service.id); setServicesQuery(""); }}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 14, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left" }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <AppIcon name={service.icon} size={18} stroke="#60a5fa" />
                                    <span style={{ fontSize: 14, fontWeight: 800 }}>{service.name}</span>
                                  </div>
                                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>{service.category}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {filteredServices.length === 0 && (
                          <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 14, fontStyle: "italic" }}>
                            Aucun résultat pour “{servicesQuery}”
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <section className="services-section">
                  <div className="services-kicker">Quotidien</div>
                  <div className="services-grid">
                    {serviceTiles.map((tile) => (
                      <button
                        key={tile.name}
                        className="service-tile"
                        onClick={() => {
                          if (tile.name === "Crédit") {
                            openAirtimeData();
                            return;
                          }
                          if (tile.name === "Internet") {
                            openInternet();
                            return;
                          }
                          if (tile.name === "Canal+") {
                            openCanalPlus();
                            return;
                          }
                          if (tile.name === "Électricité") {
                            openElectricity();
                            return;
                          }
                          if (tile.name === "Eau") {
                            openWater();
                            return;
                          }
                          if (tile.name === "Marchand") {
                            openMerchant();
                            return;
                          }
                          showToast(`${tile.name} bientôt disponible`);
                        }}
                      >
                        {tile.badge && <span className="service-badge">{tile.badge}</span>}
                        <div className="service-icon-box">
                          <AppIcon name={tile.icon} size={20} stroke={tile.accent} />
                        </div>
                        <div className="service-name">{tile.name}</div>
                        <div className="service-desc">{tile.desc}</div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="services-section" style={{ marginTop: 34 }}>
                  <div className="services-section-head">
                    <div className="services-kicker">Finance & Investissement</div>
                    <span className="services-premium-badge">PREMIUM</span>
                  </div>

                  <div className="finance-grid">
                    <button className="finance-card emerald" onClick={openSavings}>
                      <div className="finance-card-icon emerald">
                        <AppIcon name="piggy" size={22} stroke="#34d399" />
                      </div>
                      <div className="finance-card-title">Épargne</div>
                      <div className="finance-card-sub emerald">Taux annuel +4.5%</div>
                    </button>

                    <button className="finance-card amber" onClick={() => { setScreen("loans"); setNavActive("Accueil"); }}>
                      <div className="finance-card-icon amber">
                        <AppIcon name="bank" size={22} stroke="#fbbf24" />
                      </div>
                      <div className="finance-card-title">Prêt</div>
                      <div className="finance-card-sub amber">Personnel & rapide</div>
                    </button>

                    <button className="finance-card blue" onClick={openWallet}>
                      <div className="finance-card-icon blue">
                        <AppIcon name="wallet" size={22} stroke="#60a5fa" />
                      </div>
                      <div className="finance-card-title">Portefeuilles</div>
                      <div className="finance-card-sub blue">EUR / USD</div>
                    </button>

                    <button className="finance-card rose" onClick={openTontine}>
                      <div className="finance-card-icon rose">
                        <AppIcon name="users" size={22} stroke="#fb7185" />
                      </div>
                      <div className="finance-card-title">Tontine</div>
                      <div className="finance-card-sub rose">Collectif sécurisé</div>
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "merchant" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Paiement Marchand</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="hub-card">
                  <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                    <button onClick={openCameraScanner} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 40px", borderRadius: 28, border: "2px solid rgba(59,130,246,.3)", background: "rgba(59,130,246,.08)", color: "#60a5fa", fontWeight: 800, fontSize: 14, cursor: "pointer", transition: "all .2s" }}>
                      <AppIcon name="camera" size={32} stroke="#60a5fa" />
                      Scanner marchand
                    </button>
                  </div>

                  <div className="exchange-box">
                    <div className="exchange-kicker" style={{ justifyContent: "center" }}>
                      <span>Montant à régler</span>
                    </div>
                    <div className="hub-center" style={{ paddingTop: 0 }}>
                      <h3>
                        {merchantAmount || "0"} <span>XAF</span>
                      </h3>
                    </div>
                    <div style={{ padding: "0 6px" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={merchantAmount}
                        onChange={(e) => setMerchantAmount(e.target.value.replace(/\D/g, ""))}
                        style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "white", fontSize: 18, fontWeight: 800, textAlign: "center" }}
                      />
                    </div>
                  </div>

                  <button className="hub-cta" onClick={() => { const amt = Number(merchantAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "merchant", amount: amt }); openTransactionPin(); }}>Confirmer le paiement</button>

                  <div className="tontine-progress" style={{ background: 'rgba(37,99,235,.06)', borderColor: 'rgba(59,130,246,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(37,99,235,.18)', color: '#60a5fa' }}>
                        <AppIcon name="shield" size={16} stroke="#60a5fa" />
                      </div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(255,255,255,.72)' }}>
                        Tous les paiements marchands Morali Pay sont protégés par un cryptage de bout en bout et une couverture anti-fraude.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "savings" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="savings-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Épargne</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="savings-stack">
                  <div className="savings-card">
                    <div className="savings-orb">
                      <AppIcon name="piggy" size={56} stroke="#34d399" />
                    </div>
                    <div className="savings-kicker">Solde Épargne</div>
                    <div className="savings-amount">
                      <strong>{formatCurrency(savingsAmount)}</strong>
                      <span>XAF</span>
                    </div>

                    <div className="savings-divider">
                      <div>
                        <div className="savings-metric-top">Intérêts annuels</div>
                        <div className="savings-metric-bottom emerald">+{savingsAnnualRate}%</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="savings-metric-top">Gain estimé / mois</div>
                        <div className="savings-metric-bottom">~ {formatCurrency(Math.floor(savingsMonthlyGain))} F</div>
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group" style={{ marginBottom: 16 }}>
                    <label className="transaction-label">Montant (XAF)</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={savingsCustomAmount} onChange={(e) => setSavingsCustomAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="savings-actions">
                    <button className="savings-btn" onClick={() => { const amt = Number(savingsCustomAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "savings_withdraw", amount: amt }); openTransactionPin(); }}>Retirer</button>
                    <button className="savings-btn primary" onClick={() => { const amt = Number(savingsCustomAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "savings_deposit", amount: amt }); openTransactionPin(); }}>Déposer +</button>
                  </div>

                  <div className="savings-note">
                    <div className="savings-note-icon">
                      <AppIcon name="shield" size={20} stroke="#60a5fa" />
                    </div>
                    <div>
                      <div className="savings-note-title">Sécurité Garantie</div>
                      <div className="savings-note-copy">Vos fonds sont protégés et disponibles à tout moment, sans frais de retrait.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Prêt Landing Screen (choose Microcrédit or Prêt Personnel) ── */}
          <div className={`app-screen ${screen === "loans" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loans-landing">
                {/* Header */}
                <div className="loans-landing-header">
                  <div>
                    <h2 className="loans-landing-title">Nos Prêts</h2>
                    <p className="loans-landing-sub">Choisissez le financement adapté à votre besoin</p>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Microcrédit Card */}
                <button className="loans-option-card" onClick={() => setScreen("microcredit")}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon blue">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div className="loans-option-badge blue">RAPIDE</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Microcrédit</div>
                    <div className="loans-option-desc">Financement express pour vos besoins quotidiens et urgences.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 000 — 50 000</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">15 — 45</div>
                        <div className="loans-option-metric-lbl">jours</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val blue">3 — 7.5%</div>
                        <div className="loans-option-metric-lbl">intérêt</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Prêt Personnel Card */}
                <button className="loans-option-card gold" onClick={() => setScreen("personalloan")}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon gold">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <div className="loans-option-badge gold">PREMIUM</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Prêt Personnel</div>
                    <div className="loans-option-desc">Financez vos projets importants : commerce, études, équipement.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">100K — 2M</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">3 — 12</div>
                        <div className="loans-option-metric-lbl">mois</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val gold">TAEG 12%</div>
                        <div className="loans-option-metric-lbl">fixe</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Info banner */}
                <div className="loans-info-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Toutes les demandes sont soumises à l'approbation de Morali Pay. Les fonds sont crédités sous 24 à 48h après validation.</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "microcredit" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loan-screen">
                {/* ── Header ── */}
                <div className="loan-header">
                  <div className="loan-header-left">
                    <div>
                      <h2 className="loan-header-title">Microcrédit</h2>
                      <p className="loan-header-sub">Financement rapide pour vos besoins quotidiens</p>
                    </div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {microCreditStep === "done" ? (
                  <div className="success-wrap" style={{ paddingTop: 60 }}>
                    <div className="success-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" width="34" height="34" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="success-title">Demande envoyée !</div>
                    <div className="success-sub">
                      Votre demande de microcrédit de <strong style={{ color: "#fbbf24" }}>{formatCurrency(loanAmount)} FCFA</strong> est en cours d'examen.<br />
                      Vous recevrez une notification dès validation.
                    </div>
                    <button className="hub-cta" onClick={closeHub}>
                      Retour à l'accueil
                    </button>
                  </div>
                ) : microCreditStep === "confirm" ? (
                  /* ── Confirmation Step ── */
                  <div className="loan-screen" style={{ padding: 0 }}>
                    <div className="loan-confirm-card">
                      <div className="loan-confirm-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                        </svg>
                      </div>
                      <div className="loan-confirm-title">Récapitulatif de votre demande</div>

                      <div className="loan-recap-grid">
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Montant demandé</div>
                          <div className="loan-recap-value">{formatCurrency(loanAmount)} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Durée</div>
                          <div className="loan-recap-value">{microCreditDuration} jours</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Taux d'intérêt</div>
                          <div className="loan-recap-value" style={{ color: "#fbbf24" }}>{(microDailyRate * 100).toFixed(0)}%</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Intérêts totaux</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(loanAmount * microDailyRate))} FCFA</div>
                        </div>
                        <div className="loan-recap-item highlight">
                          <div className="loan-recap-label">Total à rembourser</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(microTotalToPay))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Motif</div>
                          <div className="loan-recap-value" style={{ fontSize: 12, textTransform: "none" }}>{microCreditReason || "Non précisé"}</div>
                        </div>
                      </div>

                      <div className="loan-notice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Le remboursement sera déduit automatiquement de votre solde à l'échéance.
                      </div>

                      <div className="loan-btn-group">
                        <button className="loan-btn-secondary" onClick={() => setMicroCreditStep("form")}>Modifier</button>
                        <button className="hub-cta loan-btn-confirm" disabled={loanApplicationStatus === "loading"} onClick={() => submitLoanApplication("micro")}>
                          {loanApplicationStatus === "loading" ? <div className="btn-loader" /> : "Confirmer la demande"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Form Step ── */
                  <>
                    {/* Amount selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        Montant souhaité
                      </div>
                      <div className="loan-amount-display">
                        <span className="loan-amount-value">{formatCurrency(loanAmount)}</span>
                        <span className="loan-amount-unit">FCFA</span>
                      </div>
                      <div className="loan-range">
                        <input type="range" min="1000" max="50000" step="500" value={loanAmount} onChange={(e) => setLoanAmount(parseInt(e.target.value, 10))} />
                        <div className="loan-range-labels"><span>1 000</span><span>50 000</span></div>
                      </div>
                      <div className="loan-presets">
                        {[5000, 10000, 20000, 35000, 50000].map((v) => (
                          <button key={v} className={`loan-preset-btn ${loanAmount === v ? "active" : ""}`} onClick={() => setLoanAmount(v)}>
                            {v >= 1000 ? `${v / 1000}K` : v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        Durée du remboursement
                      </div>
                      <div className="loan-duration-grid">
                        {[15, 30, 45].map((d) => (
                          <button key={d} className={`loan-duration-btn ${microCreditDuration === d ? "active" : ""}`} onClick={() => setMicroCreditDuration(d as 15 | 30 | 45)}>
                            <div className="loan-duration-value">{d}</div>
                            <div className="loan-duration-unit">jours</div>
                            <div className="loan-duration-rate">{d === 15 ? "3%" : d === 30 ? "5%" : "7.5%"}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        Motif du prêt
                      </div>
                      <textarea className="loan-textarea" placeholder="Décrivez brièvement l'usage prévu de ce microcrédit..." value={microCreditReason} onChange={(e) => setMicroCreditReason(e.target.value.slice(0, 200))} maxLength={200} rows={3} />
                      <div className="loan-char-count">{microCreditReason.length}/200</div>
                    </div>

                    {/* Summary */}
                    <div className="loan-summary-card">
                      <div className="loan-summary-row">
                        <span>Montant</span>
                        <span>{formatCurrency(loanAmount)} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Intérêts ({(microDailyRate * 100).toFixed(0)}%)</span>
                        <span style={{ color: "#fbbf24" }}>+{formatCurrency(Math.round(loanAmount * microDailyRate))} FCFA</span>
                      </div>
                      <div className="loan-summary-row total">
                        <span>Total à rembourser</span>
                        <span>{formatCurrency(Math.round(microTotalToPay))} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Échéance</span>
                        <span>{microCreditDuration} jours</span>
                      </div>
                    </div>

                    <button className="hub-cta" onClick={() => {
                      if (loanAmount <= 0) { showToast("Entrez un montant"); return; }
                      setMicroCreditStep("confirm");
                    }}>
                      Voir le récapitulatif
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "personalloan" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loan-screen">
                {/* ── Header ── */}
                <div className="loan-header">
                  <div className="loan-header-left">
                    <div>
                      <h2 className="loan-header-title">Prêt Personnel</h2>
                      <p className="loan-header-sub">Financez vos projets importants</p>
                    </div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {personalLoanStep === "done" ? (
                  <div className="success-wrap" style={{ paddingTop: 60 }}>
                    <div className="success-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" width="34" height="34" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="success-title">Demande envoyée !</div>
                    <div className="success-sub">
                      Votre demande de prêt de <strong style={{ color: "#fbbf24" }}>{formatCurrency(personalLoanAmount)} FCFA</strong> est en cours d'examen.<br />
                      Délai de traitement estimé : 24 à 48h.
                    </div>
                    <button className="hub-cta" onClick={closeHub}>
                      Retour à l'accueil
                    </button>
                  </div>
                ) : personalLoanStep === "confirm" ? (
                  /* ── Confirmation Step ── */
                  <div className="loan-screen" style={{ padding: 0 }}>
                    <div className="loan-confirm-card">
                      <div className="loan-confirm-icon" style={{ background: "linear-gradient(145deg,rgba(212,164,55,.15),rgba(212,164,55,.05))", borderColor: "rgba(212,164,55,.25)", color: "rgba(212,164,55,.9)" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                        </svg>
                      </div>
                      <div className="loan-confirm-title">Récapitulatif de votre prêt</div>

                      <div className="loan-recap-grid">
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Montant du prêt</div>
                          <div className="loan-recap-value">{formatCurrency(personalLoanAmount)} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Durée</div>
                          <div className="loan-recap-value">{personalLoanDuration} mois</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">TAEG</div>
                          <div className="loan-recap-value" style={{ color: "#fbbf24" }}>12.00%</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Mensualité estimée</div>
                          <div className="loan-recap-value" style={{ color: "#60a5fa" }}>{formatCurrency(Math.round(personalLoanMonthlyRepayment))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Intérêts totaux</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(personalLoanInterest))} FCFA</div>
                        </div>
                        <div className="loan-recap-item highlight">
                          <div className="loan-recap-label">Coût total du crédit</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(personalLoanTotalToRepay))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Motif</div>
                          <div className="loan-recap-value" style={{ fontSize: 12, textTransform: "none" }}>{personalLoanReason || "Non précisé"}</div>
                        </div>
                        {personalLoanIncome && (
                          <div className="loan-recap-item">
                            <div className="loan-recap-label">Revenus mensuels déclarés</div>
                            <div className="loan-recap-value">{formatCurrency(Number(personalLoanIncome))} FCFA</div>
                          </div>
                        )}
                      </div>

                      <div className="loan-notice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Le taux annuel effectif global (TAEG) est de 12%. Les mensualités seront prélevées automatiquement.
                      </div>

                      <div className="loan-btn-group">
                        <button className="loan-btn-secondary" onClick={() => setPersonalLoanStep("form")}>Modifier</button>
                        <button className="hub-cta loan-btn-confirm" disabled={loanApplicationStatus === "loading"} onClick={() => submitLoanApplication("personal")} style={{ background: "linear-gradient(135deg,#d4a437,#a67c00)", boxShadow: "0 10px 30px rgba(212,164,55,.3)" }}>
                          {loanApplicationStatus === "loading" ? <div className="btn-loader" /> : "Confirmer la demande"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Form Step ── */
                  <>
                    {/* Amount selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        Montant du financement
                      </div>
                      <div className="loan-amount-display gold">
                        <span className="loan-amount-value">{formatCurrency(personalLoanAmount)}</span>
                        <span className="loan-amount-unit">FCFA</span>
                      </div>
                      <div className="loan-range">
                        <input type="range" min="100000" max="2000000" step="50000" value={personalLoanAmount} onChange={(e) => setPersonalLoanAmount(Number(e.target.value))} style={{ accentColor: "#d4a437" }} />
                        <div className="loan-range-labels"><span>100 000</span><span>2 000 000</span></div>
                      </div>
                      <div className="loan-presets gold">
                        {[100000, 250000, 500000, 1000000, 2000000].map((v) => (
                          <button key={v} className={`loan-preset-btn gold ${personalLoanAmount === v ? "active" : ""}`} onClick={() => setPersonalLoanAmount(v)}>
                            {v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Durée du remboursement
                      </div>
                      <div className="loan-duration-grid">
                        {[3, 6, 12].map((m) => (
                          <button key={m} className={`loan-duration-btn gold ${personalLoanDuration === m ? "active" : ""}`} onClick={() => setPersonalLoanDuration(m)}>
                            <div className="loan-duration-value">{m}</div>
                            <div className="loan-duration-unit">mois</div>
                            <div className="loan-duration-rate">{formatCurrency(Math.round((personalLoanAmount + personalLoanAmount * (0.12 * (m / 12))) / m))}/mois</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reason & Income */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        Détails du projet
                      </div>
                      <div className="loan-field">
                        <label className="loan-field-label">Motif du prêt *</label>
                        <input className="loan-field-input" placeholder="Commerce, Équipement, Études, Santé..." value={personalLoanReason} onChange={(e) => setPersonalLoanReason(e.target.value.slice(0, 150))} maxLength={150} />
                      </div>
                      <div className="loan-field">
                        <label className="loan-field-label">Revenus mensuels (FCFA)</label>
                        <input className="loan-field-input" type="number" placeholder="Ex: 150000" value={personalLoanIncome} onChange={(e) => setPersonalLoanIncome(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="loan-summary-card gold">
                      <div className="loan-summary-row">
                        <span>Capital emprunté</span>
                        <span>{formatCurrency(personalLoanAmount)} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Taux (TAEG)</span>
                        <span>12.00%</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Durée</span>
                        <span>{personalLoanDuration} mois</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Intérêts totaux</span>
                        <span style={{ color: "#fbbf24" }}>+{formatCurrency(Math.round(personalLoanInterest))} FCFA</span>
                      </div>
                      <div className="loan-summary-row total gold">
                        <span>Coût total du crédit</span>
                        <span>{formatCurrency(Math.round(personalLoanTotalToRepay))} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Mensualité estimée</span>
                        <span style={{ color: "#60a5fa", fontWeight: 800 }}>{formatCurrency(Math.round(personalLoanMonthlyRepayment))} FCFA/mois</span>
                      </div>
                    </div>

                    <button className="hub-cta" style={{ background: "linear-gradient(135deg,#d4a437,#a67c00)", boxShadow: "0 10px 30px rgba(212,164,55,.3)" }} onClick={() => {
                      if (personalLoanAmount <= 0) { showToast("Entrez un montant"); return; }
                      if (!personalLoanReason.trim()) { showToast("Précisez le motif du prêt"); return; }
                      setPersonalLoanStep("confirm");
                    }}>
                      Voir le récapitulatif
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLES (Landing) ===== */}
          <div className={`app-screen ${screen === "wallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loans-landing">
                {/* Header */}
                <div className="loans-landing-header">
                  <div>
                    <h2 className="loans-landing-title">Portefeuilles</h2>
                    <p className="loans-landing-sub">Gérez vos devises étrangères</p>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Euro Card */}
                <button className="loans-option-card" onClick={openEurWallet}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon" style={{ background: "rgba(16,185,129,.12)", color: "#34d399" }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Montserrat',sans-serif" }}>€</span>
                    </div>
                    <div className="loans-option-badge" style={{ background: "rgba(16,185,129,.12)", color: "#34d399" }}>EURO</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Portefeuille Euro</div>
                    <div className="loans-option-desc">Détenez et convertissez vos euros. Taux en temps réel avec commission de 1.5%.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val" style={{ color: "#34d399" }}>{eurWallet.toFixed(2)}</div>
                        <div className="loans-option-metric-lbl">EUR</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 € = {Math.round(1 / currencyRates["EUR"])}</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1.5%</div>
                        <div className="loans-option-metric-lbl">commission</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Dollar Card */}
                <button className="loans-option-card" onClick={openUsdWallet}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon" style={{ background: "rgba(245,158,11,.12)", color: "#fbbf24" }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Montserrat',sans-serif" }}>$</span>
                    </div>
                    <div className="loans-option-badge" style={{ background: "rgba(245,158,11,.12)", color: "#fbbf24" }}>DOLLAR</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Portefeuille Dollar</div>
                    <div className="loans-option-desc">Détenez et convertissez vos dollars US. Taux en temps réel avec commission de 1.5%.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val" style={{ color: "#fbbf24" }}>{usdWallet.toFixed(2)}</div>
                        <div className="loans-option-metric-lbl">USD</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 $ = {Math.round(1 / currencyRates["USD"])}</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1.5%</div>
                        <div className="loans-option-metric-lbl">commission</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "currency" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="fx-screen">
                {/* ── Header ── */}
                <div className="fx-header">
                  <div className="fx-header-title">Change Devises</div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* ── Simple From / Swap / To ── */}
                <div className="fx-exchange-box">
                  {/* FROM — changes based on direction */}
                  <div className={`fx-ex-from ${fxSwapping ? "fx-swap-anim" : ""}`}>
                    <div className="fx-ex-label">Vous envoyez</div>
                    <div className="fx-ex-row">
                      <input
                        type="number"
                        className="fx-ex-input"
                        placeholder="0"
                        value={currencyAmount}
                        onChange={(e) => setCurrencyAmount(e.target.value)}
                      />
                      {currencyDirection === "sell" ? (
                        <div className={`fx-ex-currency-badge ${fxSwapping ? "fx-swap-anim" : ""}`} style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}>
                          FCFA
                        </div>
                      ) : (
                        <div className={`fx-ex-currency-selector ${fxSwapping ? "fx-swap-anim" : ""}`}>
                          {(["EUR", "USD"] as const).map((c) => (
                            <button
                              key={c}
                              className={`fx-ex-curr-btn ${targetCurrency === c ? "active" : ""}`}
                              style={targetCurrency === c ? (c === "EUR" ? { background: "rgba(16,185,129,.12)", color: "#34d399", borderColor: "rgba(16,185,129,.25)" } : { background: "rgba(245,158,11,.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,.25)" }) : {}}
                              onClick={() => { setTargetCurrency(c); setCurrencyAmount(""); }}
                            >
                              {c === "EUR" ? "€ EUR" : "$ USD"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SWAP BUTTON */}
                  <div style={{ display: "flex", justifyContent: "center", margin: "-8px 0" }}>
                    <button
                      className="fx-ex-swap-circle"
                      onClick={() => {
                        setFxSwapping(true);
                        setCurrencyDirection(currencyDirection === "sell" ? "buy" : "sell");
                        setCurrencyAmount("");
                        setTimeout(() => setFxSwapping(false), 400);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4" />
                        <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  </div>

                  {/* TO — changes based on direction */}
                  <div className={`fx-ex-to ${fxSwapping ? "fx-swap-anim" : ""}`}>
                    <div className="fx-ex-label">Vous recevez</div>
                    <div className="fx-ex-row">
                      <div className={`fx-ex-result ${fxSwapping ? "fx-swap-anim" : ""}`} style={currencyDirection === "buy" ? { color: "#60a5fa" } : {}}>
                        {currencyAmount && parseFloat(currencyAmount) > 0
                          ? currencyDirection === "sell"
                            ? (parseFloat(currencyAmount) * currencyRates[targetCurrency] * (1 - currencyFee)).toFixed(2)
                            : formatCurrency(Math.round(parseFloat(currencyAmount) / currencyRates[targetCurrency] * (1 - currencyFee)))
                          : currencyDirection === "sell" ? "0.00" : "0"}
                      </div>
                      {currencyDirection === "sell" ? (
                        <div className={`fx-ex-currency-selector ${fxSwapping ? "fx-swap-anim" : ""}`}>
                          {(["EUR", "USD"] as const).map((c) => (
                            <button
                              key={c}
                              className={`fx-ex-curr-btn ${targetCurrency === c ? "active" : ""}`}
                              style={targetCurrency === c ? (c === "EUR" ? { background: "rgba(16,185,129,.12)", color: "#34d399", borderColor: "rgba(16,185,129,.25)" } : { background: "rgba(245,158,11,.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,.25)" }) : {}}
                              onClick={() => { setTargetCurrency(c); setCurrencyAmount(""); }}
                            >
                              {c === "EUR" ? "€ EUR" : "$ USD"}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={`fx-ex-currency-badge ${fxSwapping ? "fx-swap-anim" : ""}`} style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}>
                          FCFA
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Mode indicator ── */}
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                    {currencyDirection === "sell" ? `Conversion : FCFA → ${targetCurrency}` : `Conversion : ${targetCurrency} → FCFA`}
                  </span>
                </div>

                {/* ── Summary ── */}
                {currencyAmount && parseFloat(currencyAmount) > 0 ? (
                  <div className="fx-ex-summary">
                    <div className="fx-ex-sum-row">
                      <span>Taux</span>
                      <span>1 {targetCurrency} = {Math.round(1 / currencyRates[targetCurrency])} FCFA</span>
                    </div>
                    <div className="fx-ex-sum-row">
                      <span>Frais (1.5%)</span>
                      <span>
                        {currencyDirection === "sell"
                          ? `${formatCurrency(Math.round(parseFloat(currencyAmount) * currencyFee))} FCFA`
                          : `${(parseFloat(currencyAmount) * currencyFee).toFixed(2)} ${targetCurrency}`}
                      </span>
                    </div>
                    <div className="fx-ex-sum-row">
                      <span>Votre solde {currencyDirection === "sell" ? "FCFA" : targetCurrency}</span>
                      <span>
                        {currencyDirection === "sell"
                          ? formatCurrency(firestoreBalance !== null ? firestoreBalance : dashboardData.balance)
                          : `${(targetCurrency === "EUR" ? eurWallet : usdWallet).toFixed(2)} ${targetCurrency}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="fx-ex-summary" style={{ opacity: 0.5 }}>
                    <div className="fx-ex-sum-row">
                      <span>Taux</span>
                      <span>1 {targetCurrency} = {Math.round(1 / currencyRates[targetCurrency])} FCFA</span>
                    </div>
                  </div>
                )}

                {/* ── Confirm ── */}
                <button
                  className="fx-confirm-btn"
                  disabled={serviceProcessing || !currencyAmount || parseFloat(currencyAmount) <= 0}
                  onClick={currencyDirection === "sell" ? async () => {
                    const amt = Number(currencyAmount || 0);
                    if (amt <= 0) { showToast("Entrez un montant"); return; }
                    if (!authUid) { showToast("Connexion requise"); return; }
                    const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
                    if (amt > userBal) { showToast("Solde FCFA insuffisant pour ce change"); return; }
                    try {
                      setServiceProcessing(true);
                      const userRef = doc(firebaseDb, "moraliUsers", authUid);
                      const feeAmount = Math.round(amt * currencyFee);
                      const netXaf = amt - feeAmount;
                      const convertedAmt = netXaf * currencyRates[targetCurrency];
                      await runTransaction(firebaseDb, async (tx) => {
                        const userDoc = await tx.get(userRef);
                        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
                        const currentBal = userDoc.data().balance || 0;
                        if (amt > currentBal) throw new Error("INSUFFICIENT_BALANCE");
                        const updates: Record<string, unknown> = { balance: currentBal - amt, updatedAt: serverTimestamp() };
                        if (targetCurrency === "EUR") { updates.eurWallet = (userDoc.data().eurWallet || 0) + convertedAmt; }
                        else { updates.usdWallet = (userDoc.data().usdWallet || 0) + convertedAmt; }
                        tx.update(userRef, updates);
                      });
                      await createRealtimeTransaction({ senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName, recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName, amount: amt, fees: feeAmount, type: "retrait", destination: "cash", status: "success", receiptId: "FX-" + Date.now().toString().slice(-8) });
                      await createRealtimeNotification(authUid, { title: `Change ${targetCurrency} — ${formatCurrency(amt)} FCFA → ${convertedAmt.toFixed(2)} ${targetCurrency}`, time: "À l'instant", badge: "Change", badgeClass: "nb-blue", icon: "swap", bg: "rgba(59,130,246,0.12)", read: false });
                      // ── Track exchange commission (1.5%) ──
                      if (feeAmount > 0) {
                        trackBankRevenue("exchange_fee", feeAmount, `Commission change FCFA → ${targetCurrency} — ${formatCurrency(amt)} FCFA`);
                      }
                      showToast(`Change réussi ! +${convertedAmt.toFixed(2)} ${targetCurrency} crédités`);
                      setCurrencyAmount("");
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "";
                      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
                      else showToast("Erreur lors du change");
                    } finally { setServiceProcessing(false); }
                  } : async () => {
                    const amt = Number(currencyAmount || 0);
                    if (amt <= 0) { showToast("Entrez un montant"); return; }
                    if (!authUid) { showToast("Connexion requise"); return; }
                    const walletBal = targetCurrency === "EUR" ? eurWallet : usdWallet;
                    if (amt > walletBal) { showToast(`Solde ${targetCurrency} insuffisant`); return; }
                    try {
                      setServiceProcessing(true);
                      const userRef = doc(firebaseDb, "moraliUsers", authUid);
                      const feeCurrency = amt * currencyFee;
                      const netCurrency = amt - feeCurrency;
                      const convertedXaf = Math.round(netCurrency / currencyRates[targetCurrency]);
                      await runTransaction(firebaseDb, async (tx) => {
                        const userDoc = await tx.get(userRef);
                        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
                        const currentWalletBal = targetCurrency === "EUR" ? (userDoc.data().eurWallet || 0) : (userDoc.data().usdWallet || 0);
                        if (amt > currentWalletBal) throw new Error("INSUFFICIENT_BALANCE");
                        const updates: Record<string, unknown> = { balance: (userDoc.data().balance || 0) + convertedXaf, updatedAt: serverTimestamp() };
                        if (targetCurrency === "EUR") { updates.eurWallet = currentWalletBal - amt; }
                        else { updates.usdWallet = currentWalletBal - amt; }
                        tx.update(userRef, updates);
                      });
                      await createRealtimeTransaction({ senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName, recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName, amount: convertedXaf, fees: 0, type: "depot", destination: "cash", status: "success", receiptId: "FX-" + Date.now().toString().slice(-8) });
                      await createRealtimeNotification(authUid, { title: `Change ${targetCurrency} — ${amt.toFixed(2)} ${targetCurrency} → ${formatCurrency(convertedXaf)} FCFA`, time: "À l'instant", badge: "Change", badgeClass: "nb-blue", icon: "swap", bg: "rgba(59,130,246,0.12)", read: false });
                      // ── Track exchange commission (1.5% on currency amount) ──
                      if (feeCurrency > 0) {
                        const feeXaf = Math.round(feeCurrency / currencyRates[targetCurrency]);
                        trackBankRevenue("exchange_fee", feeXaf, `Commission change ${targetCurrency} → FCFA — ${amt.toFixed(2)} ${targetCurrency}`);
                      }
                      showToast(`Change réussi ! +${formatCurrency(convertedXaf)} FCFA crédités`);
                      setCurrencyAmount("");
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "";
                      if (msg === "INSUFFICIENT_BALANCE") showToast(`Solde ${targetCurrency} insuffisant`);
                      else showToast("Erreur lors du change");
                    } finally { setServiceProcessing(false); }
                  }}
                >
                  {serviceProcessing ? <div className="btn-loader" /> : <>Confirmer</>}
                </button>
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLE EURO ===== */}
          <div className={`app-screen ${screen === "eurWallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="wallet-detail-screen">
                {/* Header */}
                <div className="wallet-detail-header">
                  <div>
                    <div className="wallet-detail-title" style={{ color: "#34d399" }}>
                      <span style={{ fontSize: 28, marginRight: 8 }}>€</span> Portefeuille Euro
                    </div>
                    <div className="wallet-detail-sub">Compte en devises — EUR</div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Solde principal */}
                <div className="wallet-detail-balance-card eur">
                  <div className="wallet-detail-card-orb" />
                  <div className="wallet-detail-card-label">Solde disponible</div>
                  <div className="wallet-detail-card-amount">{eurWallet.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.7 }}>EUR</span></div>
                  <div className="wallet-detail-card-equiv">≈ {formatCurrency(Math.round(eurWallet / currencyRates["EUR"]))} FCFA</div>
                </div>

                {/* Infos clés */}
                <div className="wallet-detail-info-grid">
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Devise</div>
                    <div className="wallet-detail-info-value">Euro (€)</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Code ISO</div>
                    <div className="wallet-detail-info-value">EUR</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Taux actuel</div>
                    <div className="wallet-detail-info-value">1 € = {Math.round(1 / currencyRates["EUR"])} FCFA</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Commission</div>
                    <div className="wallet-detail-info-value">1.5%</div>
                  </div>
                </div>

                {/* Récap équivalence */}
                <div className="wallet-detail-equivalence">
                  <div className="wallet-detail-eq-row">
                    <span>1 EUR</span>
                    <span>→ {Math.round(1 / currencyRates["EUR"])} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>10 EUR</span>
                    <span>→ {formatCurrency(Math.round(10 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>50 EUR</span>
                    <span>→ {formatCurrency(Math.round(50 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>100 EUR</span>
                    <span>→ {formatCurrency(Math.round(100 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>500 EUR</span>
                    <span>→ {formatCurrency(Math.round(500 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="wallet-detail-actions">
                  <button className="wallet-detail-action-btn green" onClick={() => { setTargetCurrency("EUR"); setCurrencyDirection("sell"); setCurrencyAmount(""); openCurrency(); }}>
                    Acheter des EUR
                  </button>
                  <button className="wallet-detail-action-btn outline-green" onClick={() => { setTargetCurrency("EUR"); setCurrencyDirection("buy"); setCurrencyAmount(""); openCurrency(); }}>
                    Vendre des EUR
                  </button>
                </div>

                <div style={{ padding: "0 4px", marginTop: 8 }}>
                  <div className="wallet-detail-notice">
                    <AppIcon name="shield" size={14} stroke="#64748b" />
                    <span>Taux indicatif. Commission de 1.5% appliquée sur chaque opération de change.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLE DOLLAR ===== */}
          <div className={`app-screen ${screen === "usdWallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="wallet-detail-screen">
                {/* Header */}
                <div className="wallet-detail-header">
                  <div>
                    <div className="wallet-detail-title" style={{ color: "#fbbf24" }}>
                      <span style={{ fontSize: 28, marginRight: 8 }}>$</span> Portefeuille Dollar
                    </div>
                    <div className="wallet-detail-sub">Compte en devises — USD</div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Solde principal */}
                <div className="wallet-detail-balance-card usd">
                  <div className="wallet-detail-card-orb" />
                  <div className="wallet-detail-card-label">Solde disponible</div>
                  <div className="wallet-detail-card-amount">{usdWallet.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.7 }}>USD</span></div>
                  <div className="wallet-detail-card-equiv">≈ {formatCurrency(Math.round(usdWallet / currencyRates["USD"]))} FCFA</div>
                </div>

                {/* Infos clés */}
                <div className="wallet-detail-info-grid">
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Devise</div>
                    <div className="wallet-detail-info-value">Dollar américain ($)</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Code ISO</div>
                    <div className="wallet-detail-info-value">USD</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Taux actuel</div>
                    <div className="wallet-detail-info-value">1 $ = {Math.round(1 / currencyRates["USD"])} FCFA</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Commission</div>
                    <div className="wallet-detail-info-value">1.5%</div>
                  </div>
                </div>

                {/* Récap équivalence */}
                <div className="wallet-detail-equivalence">
                  <div className="wallet-detail-eq-row">
                    <span>1 USD</span>
                    <span>→ {Math.round(1 / currencyRates["USD"])} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>10 USD</span>
                    <span>→ {formatCurrency(Math.round(10 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>50 USD</span>
                    <span>→ {formatCurrency(Math.round(50 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>100 USD</span>
                    <span>→ {formatCurrency(Math.round(100 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>500 USD</span>
                    <span>→ {formatCurrency(Math.round(500 / currencyRates["USD"]))} FCFA</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="wallet-detail-actions">
                  <button className="wallet-detail-action-btn gold" onClick={() => { setTargetCurrency("USD"); setCurrencyDirection("sell"); setCurrencyAmount(""); openCurrency(); }}>
                    Acheter des USD
                  </button>
                  <button className="wallet-detail-action-btn outline-gold" onClick={() => { setTargetCurrency("USD"); setCurrencyDirection("buy"); setCurrencyAmount(""); openCurrency(); }}>
                    Vendre des USD
                  </button>
                </div>

                <div style={{ padding: "0 4px", marginTop: 8 }}>
                  <div className="wallet-detail-notice">
                    <AppIcon name="shield" size={14} stroke="#64748b" />
                    <span>Taux indicatif. Commission de 1.5% appliquée sur chaque opération de change.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CRÉDIT (Airtime) ===== */}
          <div className={`app-screen ${screen === "credit" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Crédit Téléphonique</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="operator-grid">
                    <button className={`operator-card ${airtimeOperator === "mtn" ? "active-mtn" : ""}`} onClick={() => setAirtimeOperator("mtn")}>
                      <div className="operator-badge" style={{ background: "#ffcc00", color: "#000" }}>MTN</div>
                      <span style={{ color: airtimeOperator === "mtn" ? "#fff" : "#64748b" }}>MoMo</span>
                    </button>
                    <button className={`operator-card ${airtimeOperator === "airtel" ? "active-airtel" : ""}`} onClick={() => setAirtimeOperator("airtel")}>
                      <div className="operator-badge" style={{ background: "#ff0000", color: "#fff" }}>Airtel</div>
                      <span style={{ color: airtimeOperator === "airtel" ? "#fff" : "#64748b" }}>Money</span>
                    </button>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de téléphone</label>
                    <div className="phone-input-wrap">
                      <span className="phone-prefix">+242</span>
                      <input type="tel" placeholder="" value={airtimePhone} onChange={(e) => setAirtimePhone(e.target.value)} />
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant (XAF)</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={airtimeAmount} onChange={(e) => setAirtimeAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit" style={{ color: airtimeOperator === "mtn" ? "#ffcc00" : "#ff4d4d" }}>-{airtimeOperator.toUpperCase()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="preset-row">
                    {[100, 200, 500, 1000, 2000, 5000].map((preset) => (
                      <button key={preset} className={`preset-btn ${airtimeAmount === String(preset) ? "active" : ""}`} onClick={() => setAirtimeAmount(String(preset))}>{formatCurrency(preset)}</button>
                    ))}
                  </div>

                  <button className="hub-cta" disabled style={{ background: airtimeOperator === "mtn" ? "#ffcc00" : "#ff0000", color: airtimeOperator === "mtn" ? "#000" : "#fff", boxShadow: "none", opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== INTERNET (Data) ===== */}
          <div className={`app-screen ${screen === "internet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Forfait Internet</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.14)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="globe" size={24} stroke="#60a5fa" />
                    </div>
                    <div>
                      <div className="service-wide-title">Pass Data</div>
                      <div className="service-wide-sub">Achetez votre forfait internet en instantané</div>
                    </div>
                  </div>

                  <div className="operator-grid">
                    <button className={`operator-card ${internetOperator === "mtn" ? "active-mtn" : ""}`} onClick={() => setInternetOperator("mtn")}>
                      <div className="operator-badge" style={{ background: "#ffcc00", color: "#000" }}>MTN</div>
                      <span style={{ color: internetOperator === "mtn" ? "#fff" : "#64748b" }}>MoMo</span>
                    </button>
                    <button className={`operator-card ${internetOperator === "airtel" ? "active-airtel" : ""}`} onClick={() => setInternetOperator("airtel")}>
                      <div className="operator-badge" style={{ background: "#ff0000", color: "#fff" }}>Airtel</div>
                      <span style={{ color: internetOperator === "airtel" ? "#fff" : "#64748b" }}>Money</span>
                    </button>
                  </div>

                  <div className="member-list" style={{ marginBottom: 12 }}>
                    {['1 Go (500 F)', '3 Go (1 000 F)', '5 Go (2 000 F)', '10 Go (3 500 F)'].map((plan) => (
                      <button key={plan} className={`member-row ${internetAmount === plan.split(" (")[1].replace(")", "") ? 'current' : ''}`} onClick={() => setInternetAmount(plan.split(" (")[1].replace(")", ""))}>
                        <div className="member-name">{plan.split(" (")[0].trim()}</div>
                        <div className="member-pill" style={{ background: internetAmount === plan.split(" (")[1].replace(")", "") ? '#3b82f6' : 'transparent', color: '#60a5fa', border: 'none', padding: 0 }}>{plan.split(" (")[1].replace(")", "")}</div>
                      </button>
                    ))}
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de téléphone</label>
                    <div className="phone-input-wrap">
                      <span className="phone-prefix">+242</span>
                      <input type="tel" placeholder="" value={internetPhone} onChange={(e) => setInternetPhone(e.target.value)} />
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: "#3b82f6", color: "#fff", boxShadow: "none", opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "canalplus" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Canal+</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="tv" size={24} stroke="#a78bfa" />
                    </div>
                    <div>
                      <div className="service-wide-title">Canal+ Afrique</div>
                      <div className="service-wide-sub">Réabonnement instantané 24h/7j</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de carte décodeur</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="" value={canalDecoder} onChange={(e) => setCanalDecoder(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="member-list">
                    {['Access (5 000 F)', 'Evasion (10 000 F)', 'Tout Canal (40 000 F)'].map((b) => (
                      <button key={b} className={`member-row ${canalPlan === b ? 'current' : ''}`} onClick={() => setCanalPlan(b)}>
                        <div className="member-name">{b.split('(')[0].trim()}</div>
                        <div className="member-pill" style={{ background: canalPlan === b ? '#3b82f6' : 'transparent', color: '#60a5fa', border: 'none', padding: 0 }}>{b.split('(')[1].replace(')', '')}</div>
                      </button>
                    ))}
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#fff', color: '#000', boxShadow: '0 10px 30px rgba(255,255,255,.08)', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== ÉLECTRICITÉ ===== */}
          <div className={`app-screen ${screen === "electricity" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Électricité</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.14)" }}>
                    <div className="service-wide-icon" style={{ background: "rgba(251,191,36,.12)" }}>
                      <AppIcon name="bolt" size={24} stroke="#fbbf24" />
                    </div>
                    <div>
                      <div className="service-wide-title">Électricité</div>
                      <div className="service-wide-sub">Payez vos factures SNE & achetez vos jetons</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de compteur ou contrat</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" placeholder="" value={elecMeter} onChange={(e) => setElecMeter(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant à payer</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={elecAmount} onChange={(e) => setElecAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="tontine-progress" style={{ background: 'rgba(251,191,36,.06)', borderColor: 'rgba(251,191,36,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(251,191,36,.16)', color: '#fbbf24' }}>✓</div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(251,191,36,.84)' }}>Votre reçu sera disponible instantanément dans vos transactions.</div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#f59e0b', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== EAU ===== */}
          <div className={`app-screen ${screen === "water" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Eau</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.14)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="droplet" size={24} stroke="#38bdf8" />
                    </div>
                    <div>
                      <div className="service-wide-title">Eau</div>
                      <div className="service-wide-sub">Payez vos factures SNDE / LCDE</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de compteur ou contrat</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" placeholder="" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant à payer</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={waterAmount} onChange={(e) => setWaterAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="tontine-progress" style={{ background: 'rgba(56,189,248,.06)', borderColor: 'rgba(56,189,248,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(56,189,248,.16)', color: '#38bdf8' }}>✓</div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(56,189,248,.84)' }}>Votre reçu sera disponible instantanément dans vos transactions.</div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#0ea5e9', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "tontine" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Tontine Digitale</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="hub-card">
                  <div className="tontine-head">
                    <h2 className="hub-title" style={{ fontSize: 22 }}>Tontine Digitale</h2>
                    <p className="tontine-sub">Créez et gérez vos tontines</p>
                  </div>

                  <div className="tontine-create-form">
                    <input type="text" placeholder="Nom de la tontine" value={tontineName} onChange={(e) => setTontineName(e.target.value)} />
                    <input type="text" inputMode="numeric" placeholder="Contribution par membre (XAF)" value={tontineContributionAmount} onChange={(e) => setTontineContributionAmount(e.target.value.replace(/\D/g, ""))} />
                    <button className="tontine-create-btn" onClick={() => { if (!tontineName.trim() || !Number(tontineContributionAmount) || Number(tontineContributionAmount) <= 0) { showToast("Remplissez tous les champs"); return; } const next = [...tontineGroups, { name: tontineName.trim(), contributionAmount: tontineContributionAmount, members: [] }]; setTontineGroups(next); saveTontineGroups(next); setTontineName(""); setTontineContributionAmount(""); showToast("Tontine créée avec succès !"); }}>Créer une tontine</button>
                  </div>

                  {tontineGroups.length === 0 ? (
                    <div className="member-list" style={{ padding: "24px 0" }}>
                      <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>Aucune tontine active. Créez-en une pour commencer.</p>
                    </div>
                  ) : (
                    tontineGroups.map((group, gi) => {
                      const paidCount = group.members.filter((m) => m.paid).length;
                      const totalMembers = group.members.length;
                      const progressPct = totalMembers > 0 ? Math.round((paidCount / totalMembers) * 100) : 0;
                      return (
                        <div key={gi} className="tontine-group-card">
                          <div className="tontine-group-header">
                            <div className="tontine-group-name">{group.name}</div>
                            <div className="tontine-group-amount">{formatCurrency(Number(group.contributionAmount))} F / membre</div>
                          </div>

                          <div className="hub-metrics" style={{ marginBottom: 12 }}>
                            <div className="hub-metric">
                              <div className="hub-metric-label">Membres</div>
                              <div className="hub-metric-value">{totalMembers}</div>
                            </div>
                            <div className="hub-metric">
                              <div className="hub-metric-label">Contributions</div>
                              <div className="hub-metric-value" style={{ color: "#fb7185" }}>{paidCount}/{totalMembers}</div>
                            </div>
                          </div>

                          {totalMembers > 0 && (
                            <div className="tontine-progress" style={{ marginBottom: 12, background: "rgba(244,63,94,.06)", borderColor: "rgba(244,63,94,.12)" }}>
                              <div className="tontine-progress-row">
                                <span>Progression</span>
                                <strong style={{ color: "#fb7185" }}>{progressPct}%</strong>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.06)", marginTop: 8, overflow: "hidden" }}>
                                <div className="tontine-bar" style={{ width: `${progressPct}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #f43f5e, #fb7185)" }} />
                              </div>
                            </div>
                          )}

                          <div className="member-add-row">
                            <input type="text" placeholder="Nom du membre" value={tontineNewMemberName} onChange={(e) => setTontineNewMemberName(e.target.value)} />
                            <button className="member-add-btn" onClick={() => { if (!tontineNewMemberName.trim()) { showToast("Entrez un nom"); return; } const next = tontineGroups.map((g, idx) => idx === gi ? { ...g, members: [...g.members, { name: tontineNewMemberName.trim(), paid: false }] } : g); setTontineGroups(next); saveTontineGroups(next); setTontineNewMemberName(""); }}>Ajouter</button>
                          </div>

                          {group.members.length > 0 && (
                            <div className="member-list">
                              {group.members.map((member, mi) => (
                                <div key={mi} className="member-row">
                                  <div className="member-avatar" style={{ background: member.paid ? "rgba(244,63,94,.18)" : "rgba(255,255,255,.06)", color: member.paid ? "#fb7185" : "#64748b" }}>{member.name[0].toUpperCase()}</div>
                                  <div className="member-main">
                                    <div className="member-name">{member.name}</div>
                                    <div className="member-status">
                                      <span className="member-pill" style={{ background: member.paid ? "rgba(244,63,94,.15)" : "rgba(255,255,255,.04)", color: member.paid ? "#fb7185" : "#64748b", fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>{member.paid ? "Contribué" : "En attente"}</span>
                                    </div>
                                  </div>
                                  {!member.paid && (
                                    <button className="member-add-btn" style={{ height: 34, padding: "0 12px", fontSize: 11 }} onClick={async () => { const contribAmt = Number(group.contributionAmount); const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance; if (contribAmt > userBal) { showToast("Solde insuffisant pour cette contribution"); return; } await executeServiceDebit(contribAmt, `Tontine ${group.name}`, "users"); const next = tontineGroups.map((g, idx) => idx === gi ? { ...g, pot: (g.pot || 0) + contribAmt, members: g.members.map((m, midx) => midx === mi ? { ...m, paid: true } : m) } : g); setTontineGroups(next); saveTontineGroups(next); }}>Contribuer</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Pot display and distribute button */}
                          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(212,164,55,0.06)", border: "1px solid rgba(212,164,55,0.15)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 9, color: "rgba(212,164,55,0.7)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pot total</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontFamily: "'Montserrat',sans-serif", marginTop: 2 }}>{formatCurrency(group.pot || 0)} F</div>
                              </div>
                              {totalMembers > 0 && paidCount === totalMembers && (group.pot || 0) > 0 ? (
                                <button
                                  onClick={() => {
                                    const sharePerMember = Math.floor((group.pot || 0) / totalMembers);
                                    setTontineDistConfirm({ groupIndex: gi, pot: group.pot || 0, members: totalMembers, sharePerMember });
                                  }}
                                  style={{
                                    height: 36, borderRadius: 10, border: "none", cursor: "pointer",
                                    background: "linear-gradient(135deg, #D4A437, #b8862d)", color: "#000",
                                    fontSize: 11, fontWeight: 800, padding: "0 14px",
                                    boxShadow: "0 4px 12px rgba(212,164,55,0.3)",
                                  }}
                                >Distribuer le pot</button>
                              ) : (
                                <div style={{ fontSize: 10, color: "#64748b", textAlign: "right", maxWidth: 120 }}>
                                  {paidCount}/{totalMembers} contributions nécessaires
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "crypto" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Échange Crypto</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>


                <div className="hub-card">
                  <div className="exchange-stack">
                    <div className="exchange-box">
                      <div className="exchange-kicker">
                        <span>Vous payez</span>
                        <span>Solde: {formatCurrency(firestoreBalance !== null ? firestoreBalance : dashboardData.balance)} F</span>
                      </div>
                      <div className="exchange-row">
                        <input type="number" placeholder="0" value={xafAmount} onChange={(e) => setXafAmount(e.target.value)} />
                        <div className="exchange-unit">XAF (Mobile Money)</div>
                      </div>
                    </div>

                    <div className="swap-button">
                      <div>
                        <AppIcon name="receive" size={18} stroke="#fff" />
                      </div>
                    </div>

                    <div className="exchange-box receive">
                      <div className="exchange-kicker">
                        <span>Vous recevez</span>
                        <span>Taux: 1 USDT = {cryptoRate} F</span>
                      </div>
                      <div className="exchange-row">
                        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "Montserrat, sans-serif" }}>{cryptoUsdtValue}</div>
                        <div className="token-wrap">
                          <div className="token-badge">T</div>
                          <div className="exchange-unit" style={{ color: "#10b981" }}>USDT</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "payments" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="payments-screen">
                <div className="tab-head">
                  <div className="tab-title">Transferts</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <button className="btn-camera-top" onClick={openCameraScanner} aria-label="Scanner">
                      <AppIcon name="camera" size={20} stroke="#fff" />
                    </button>
                    <button className="contact-modal-close" onClick={() => { setScreen("dashboard"); setNavActive("Accueil"); }} aria-label="Fermer">
                      <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <p className="tab-kicker">Envoyer à un contact</p>
                  <div className="contacts-scroll">
                    <div className="contact-item add-new" onClick={addNewContact}>
                      <div className="add-circle">
                        <AppIcon name="request" size={20} stroke="currentColor" />
                      </div>
                      <span className="contact-name">Nouveau</span>
                    </div>
                    {paymentContacts.map((contact) => (
                      <div key={contact.name} className="contact-item" onClick={() => { openPaymentsTab(); setServicesQuery(""); closeContactModal(); }}>
                        <div className={`contact-circle ${contact.tone}`}>{contact.name[0]}</div>
                        <span className="contact-name">{contact.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {contactModalOpen && (
                  <div className="contact-modal-overlay" onClick={closeContactModal}>
                    <div className="contact-modal" onClick={(event) => event.stopPropagation()}>
                      <div className="contact-modal-head">
                        <div>
                          <div className="contact-modal-title">Nouveau contact</div>
                          <div className="contact-modal-sub">Recherchez un client Morali par pseudo ou identifiant pour l’ajouter à vos bénéficiaires.</div>
                        </div>
                        <button className="contact-modal-close" onClick={closeContactModal} aria-label="Fermer">
                          <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                        </button>
                      </div>

                      <div className="contact-modal-field">
                        <label className="contact-modal-label">Rechercher un contact</label>
                        <div className="search-box">
                          <input
                            className="contact-modal-input"
                            type="text"
                            placeholder="@pseudo ou numéro de compte..."
                            value={contactQuery}
                            onChange={(e) => setContactQuery(e.target.value)}
                          />
                          {contactSearchLoading && <div className="loader-spinner" />}
                        </div>
                      </div>

                      {verifiedMoraliUser && (
                        <div className="user-preview">
                          <div className={`contact-modal-avatar ${verifiedMoraliUser.tone}`}>{verifiedMoraliUser.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="contact-modal-preview-name">{verifiedMoraliUser.name}</div>
                            <div className="preview-status">Compte Morali vérifié • {verifiedMoraliUser.pseudo}</div>
                          </div>
                        </div>
                      )}

                      {!contactSearchLoading && contactQuery.trim().length > 2 && !verifiedMoraliUser && (
                        <div className="contact-modal-preview">
                          <div className="contact-modal-avatar">?</div>
                          <div>
                            <div className="contact-modal-preview-name">Aucun compte trouvé</div>
                            <div className="contact-modal-preview-meta">Essayez @sarah, @prince ou un identifiant Morali</div>
                          </div>
                        </div>
                      )}

                      <div className="contact-modal-actions">
                        <button className="contact-modal-btn secondary" onClick={closeContactModal}>Annuler</button>
                        <button className="contact-modal-btn primary" id="addBtn" onClick={confirmAddNewContact} disabled={!verifiedMoraliUser}>Ajouter au favoris</button>
                      </div>
                    </div>
                  </div>
                )}

                {requestQrOpen && (
                  <div className="request-modal-overlay" onClick={closeRequestQr}>
                    <div className="request-container" onClick={(event) => event.stopPropagation()}>
                      <button className="request-close" onClick={closeRequestQr} aria-label="Fermer">
                        <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                      </button>
                      <div className="qr-glass-card">
                        <div className="qr-header">
                          <span className="qr-label">MON QR CODE MORALI</span>
                          <div className="qr-status-dot" />
                        </div>
                        <div className="qr-main">
                          <div className="qr-frame">
                            <QRCodeSVG
                              value={JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName, ts: Date.now() })}
                              size={180}
                              bgColor="#ffffff"
                              fgColor="#0d1b3e"
                              level="H"
                              includeMargin={false}
                            />
                            <div className="qr-logo-overlay">M</div>
                          </div>
                        </div>
                        <div className="qr-footer">
                          <span className="user-id">{bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`}</span>
                          <p className="qr-instruction">Scanner pour me payer instantanément</p>
                        </div>
                      </div>
                      <div className="share-actions">
                        <button className="btn-share" onClick={() => {
                          const qrPayload = JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName });
                          navigator.clipboard.writeText(qrPayload).then(() => showToast("Lien copié !")).catch(() => showToast("Erreur de copie"));
                        }}>Copier le lien</button>
                        <button className="btn-share secondary" onClick={async () => {
                          const qrPayload = JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName });
                          if (navigator.share) {
                            try {
                              await navigator.share({ title: "Paiement Morali Pay", text: `Paiement via Morali Pay pour ${dashboardName}`, url: qrPayload });
                            } catch {}
                          } else {
                            navigator.clipboard.writeText(qrPayload).then(() => showToast("Lien copié !")).catch(() => showToast("Erreur de copie"));
                          }
                        }}>Partager</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Transfer modal (extracted to TransferView) ── */}
                <TransferView
                  open={transferOpen}
                  onClose={() => setTransferOpen(false)}
                  onNavigate={(screen) => { setTransferOpen(false); setScreen(screen as Screen); }}
                  authUid={authUid || ""}
                  dashboardName={dashboardName}
                  bankingIdentity={bankingIdentity}
                  balance={firestoreBalance !== null ? firestoreBalance : dashboardData.balance}
                  securitySettings={securitySettings}
                  showToast={showToast}
                  showQuickNotif={showQuickNotif}
                  promptBiometric={promptBiometric}
                  getAuthHeaders={getAuthHeaders}
                  findMoraliUser={findMoraliUser}
                  createRealtimeNotification={createRealtimeNotification}
                  createRealtimeTransaction={createRealtimeTransaction}
                  openCameraScanner={openCameraScanner}
                  initialRecipientQuery={transferInitialQueryRef.current}
                />

                <div className="tab-grid-two">
                  <button className="service-card virement" onClick={openTransferModal}>
                    <div className="service-icon-box">
                      <AppIcon name="send" size={18} stroke="#60a5fa" />
                    </div>
                    <div>
                      <p className="tab-card-title">Virement</p>
                      <p className="tab-card-sub">Vers banque ou mobile</p>
                    </div>
                  </button>
                  <button className="service-card demander" onClick={openRequestQr}>
                    <div className="service-icon-box">
                      <AppIcon name="request" size={18} stroke="#4ade80" />
                    </div>
                    <div>
                      <p className="tab-card-title">Demander</p>
                      <p className="tab-card-sub">Lien de paiement QR</p>
                    </div>
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
                    <p className="tab-kicker" style={{ color: "var(--gold)" }}>Activité récente</p>
                    <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 800, cursor: "pointer" }} onClick={() => setHistoryModalOpen(true)}>Voir tout →</span>
                  </div>
                  <div className="activity-wrap">
                    {(() => {
                      // In the Transfers tab, only show transfer-related transactions (send/receive)
                      const allTx = liveTransactions.length ? liveTransactions : dashboardData.transactions;
                      const transferOnly = allTx.filter((tx) => tx.icon === "send" || tx.icon === "receive" || tx.name.toLowerCase().includes("virement"));
                      if (transferOnly.length === 0) {
                        return (
                          <div style={{ padding: "28px 16px", textAlign: "center" }}>
                            <div style={{ width: 56, height: 56, margin: "0 auto 10px", borderRadius: 16, background: "linear-gradient(135deg, rgba(212,164,55,0.15), rgba(26,62,120,0.2))", border: "1px solid rgba(212,164,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", lineHeight: 1.5 }}>Aucun virement effectué.<br />Vos transferts apparaîtront ici.</div>
                          </div>
                        );
                      }
                      return transferOnly.slice(0, 5).map((tx, idx) => (
                        <div className="activity-item" key={tx.receiptId || `act-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: idx < transferOnly.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: tx.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <AppIcon name={tx.icon} size={18} stroke={tx.type === "credit" ? "#60a5fa" : "rgba(255,255,255,0.82)"} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</div>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{tx.dateTimestamp ? timeAgo(tx.dateTimestamp) : tx.date}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: tx.type === "credit" ? "#22c55e" : "var(--fg)" }}>{tx.type === "credit" ? "+" : "-"}{tx.amount}</div>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{tx.category}</div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "privileges" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="privileges-screen">

                {/* ── HERO IMAGE SECTION ── */}
                <div className="priv-hero-img-wrap">
                  <img src="/black-card-hero.png" alt="Morali Black Card" />
                  <div className="priv-hero-img-overlay" />
                  <div className="priv-hero-img-content">
                    <div className="priv-kicker-row">
                      <MoraliShield small />
                      <div className="priv-kicker-text">Morali Pay</div>
                    </div>
                    <div className="priv-badge-coming">
                      <div className="priv-badge-coming-dot" />
                      <div className="priv-badge-coming-text">Bientôt disponible</div>
                    </div>
                    <h1 className="priv-hero-title">
                      La Carte <span>Black</span><br />d&apos;exception
                    </h1>
                    <p className="priv-hero-sub">Votre passeport vers un monde de privilèges exclusifs. Puissance, prestige et performances bancaires réunis.</p>
                  </div>
                </div>

                {/* ── BODY CONTENT ── */}
                <div className="priv-body" style={{ paddingTop: 28 }}>

                  {/* EXCLUSIVE NUMBERS */}
                  <div className="priv-section-label">En chiffres</div>
                  <div className="priv-stats-row">
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">5M+</div>
                      <div className="priv-stat-label">Plafond mensuel</div>
                    </div>
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">3.5%</div>
                      <div className="priv-stat-label">Cashback premium</div>
                    </div>
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">24/7</div>
                      <div className="priv-stat-label">Conciergerie dédiée</div>
                    </div>
                  </div>

                  <div className="priv-divider" />

                  {/* BENEFITS GRID */}
                  <div className="priv-section-label">Avantages exclusifs</div>
                  <div className="priv-benefits-grid">
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon gold">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      </div>
                      <div className="priv-benefit-name">Plafonds Élevés</div>
                      <div className="priv-benefit-desc">Limites de dépenses et retraits ajustables selon votre profil.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon sapphire">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div className="priv-benefit-name">Cashback Renforcé</div>
                      <div className="priv-benefit-desc">Jusqu&apos;à 3.5% de remise sur tous vos achats premium.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon emerald">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div className="priv-benefit-name">Conciergerie 24/7</div>
                      <div className="priv-benefit-desc">Assistance personnelle pour voyages, réservations et demandes.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon rose">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                      </div>
                      <div className="priv-benefit-name">Assurance Voyage</div>
                      <div className="priv-benefit-desc">Couverture internationale complète sur vos déplacements.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon amber">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div className="priv-benefit-name">Accès Lounges</div>
                      <div className="priv-benefit-desc">Salons VIP dans plus de 1 300 aéroports dans le monde.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon violet">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div className="priv-benefit-name">Sécurité Maximale</div>
                      <div className="priv-benefit-desc">Protection anti-fraud avancée et authentification biométrique.</div>
                    </div>
                  </div>

                  <div className="priv-divider" />

                  {/* EXCLUSIVE BANNER */}
                  <div className="priv-exclusive-banner">
                    <div className="priv-exclusive-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="priv-exclusive-title">Sur invitation uniquement</div>
                    <div className="priv-exclusive-desc">
                      La Carte Morali Black est réservée à nos clients les plus exclusifs. Un programme sur sélection pour une expérience bancaire d&apos;exception.
                    </div>
                  </div>

                  {/* CTA */}
                  <button className="priv-cta-btn" onClick={openBlackCardModal}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    Demander ma Carte Black
                  </button>

                  <div className="priv-divider" />

                  {/* FOOTER */}
                  <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
                    <p style={{ fontSize: 10, color: '#334155', fontWeight: 700, letterSpacing: '.05em' }}>MORALI PAY — Programme Black Card</p>
                    <p style={{ fontSize: 9, color: '#1e293b', fontWeight: 600, marginTop: 4 }}>Conditions d&apos;éligibilité applicables. Réservé aux clients sélectionnés.</p>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {screen === "cards" && (
            <CardsView
              cardLocked={cardLocked}
              cardTransform={cardTransform}
              onCardMove={handleCardMove}
              onCardLeave={() => setCardTransform("rotateX(4deg) rotateY(-3deg)")}
              cardNumber={dashboardData.cardNumber}
              cardCcv={dashboardData.cardCcv}
              cardExp={dashboardData.cardExp}
              holder={dashboardData.holder}
              blackCardNumber={dashboardData.blackCardNumber}
              blackCardCcv={dashboardData.blackCardCcv}
              blackCardExp={dashboardData.blackCardExp}
              onBlackCardClick={openBlackCardModal}
              onHistoryClick={() => setHistoryModalOpen(true)}
              cardActions={cardActions}
              onCardAction={(label) => {
                if (label === "Geler la carte") openManageCardModal();
                else if (label === "Code PIN") openPinModal();
                else if (label === "Limites") openCardLimitsModal();
                else if (label === "Nouvelle") openVirtualCardModal();
                else showToast(label);
              }}
              showToast={showToast}
            />
          )}

          {screen === "profile" && (
            <ProfileView
              holder={dashboardData.holder}
              bankingId={bankingIdentity.id}
              kycConfig={kycConfig}
              kycLevel={kycLevel}
              secLevelCount={secLevelCount}
              profileGroups={profileGroups}
              onAction={(label) => {
                if (label === "Informations Personnelles") openInfoDrawer();
                else if (label === "Sécurité & Biométrie") openSecurityModal();
                else if (label === "Historique des Reçus") openReceiptsModal();
                else if (label === "Support Client") openSupportModal();
                else if (label === "Conditions d'utilisation") openTermsModal();
                else if (label === "Confidentialité") { setPrivacySaveState("idle"); setPrivacyAccessLogOpen(false); setPrivacyTab("settings"); setPrivacyModalOpen(true); }
                else if (label === "Politique de confidentialité") { setPrivacyTab("policy"); setPrivacyModalOpen(true); }
                else showToast(label);
              }}
              onLogout={() => setLogoutModalOpen(true)}
            />
          )}

          {(screen === "dashboard" || historyModalOpen) && (
          <DashboardView
            dashboardName={dashboardName}
            dashboardData={dashboardData}
            chartBalance={chartBalance}
            sparklinePath={sparklinePath}
            chartDays={chartDays}
            weeklyStats={weeklyStats}
            chartData={chartData}
            dynamicChartDays={dynamicChartDays}
            liveTransactions={liveTransactions}
            notifications={notifications}
            unreadNotificationsCount={unreadNotificationsCount}
            cardLocked={cardLocked}
            setCardLocked={setCardLocked}
            cardGenerating={cardGenerating}
            handleCardGenerate={handleCardGenerate}
            cardTransform={cardTransform}
            handleCardMove={handleCardMove}
            setCardTransform={setCardTransform}
            cardNumberRevealed={cardNumberRevealed}
            activeCardNumber={activeCardNumber}
            maskCardNumber={maskCardNumber}
            toggleCardNumberReveal={toggleCardNumberReveal}
            activeCardCcv={activeCardCcv}
            activeCardExp={activeCardExp}
            chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod}
            chartTooltip={chartTooltip}
            setChartTooltip={setChartTooltip}
            notificationsOpen={notificationsOpen}
            setNotificationsOpen={setNotificationsOpen}
            historyModalOpen={historyModalOpen}
            setHistoryModalOpen={setHistoryModalOpen}
            renderProtectedAmount={renderProtectedAmount}
            showToast={showToast}
            openTransaction={openTransaction}
            openServices={openServices}
            openPaymentsTab={openPaymentsTab}
            onNavigateProfile={() => { setScreen("profile"); setNavActive("Profil"); }}
          />
          )}
        </div>

        {screen !== "auth" && screen !== "admin" && (
          <nav className="bottom-nav" role="tablist" aria-label="Navigation principale">
            {navItems.map((item) => {
              const active = navActive === item;
              return (
                <div
                  key={item}
                  className={`bn ${active ? "act" : ""}`}
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (item === "Accueil") {
                      openDashboard();
                      return;
                    }
                    if (item === "Cartes") {
                      openCardsTab();
                      return;
                    }
                    if (item === "Privilèges") {
                      openPrivilegesTab();
                      return;
                    }
                    if (item === "Profil") {
                      openProfileTab();
                      return;
                    }
                  }}
                  onKeyDown={(e) => {
                    const items = navItems;
                    const idx = items.indexOf(item);
                    if (e.key === "ArrowRight") { const next = items[(idx + 1) % items.length]; const el = document.querySelector(`[aria-selected="${next === navActive}"]`)?.parentElement?.children[idx + 1] as HTMLElement; el?.focus(); }
                    if (e.key === "ArrowLeft") { const prev = items[(idx - 1 + items.length) % items.length]; const el = document.querySelector(`[aria-selected="${prev === navActive}"]`)?.parentElement?.children[idx - 1] as HTMLElement; el?.focus(); }
                  }}
                >
                  <div className={`bn-ico ${active ? "act" : ""}`}>
                    {renderNavIcon(item, active)}
                  </div>
                  <div className="bn-lbl">{item}</div>
                  <div className="bn-pip" />
                </div>
              );
            })}
          </nav>
        )}

        <div className={`modal-drawer-overlay ${infoDrawerOpen ? "active" : ""}`} onClick={closeInfoDrawer}>
          <div className="modal-drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-handle" />
            <div className="modal-drawer-header">
              <h3>Mes Informations</h3>
              <button className="btn-close-circle" onClick={closeInfoDrawer} aria-label="Fermer">×</button>
            </div>
            <section className="banking-identity">
              <div className="banking-identity-card" onClick={() => copyToClipboard("id", bankingIdentity.id)}>
                <div className="banking-identity-copy">
                  <span className="banking-identity-label">ID MORALI</span>
                  <span className="banking-identity-value master">{bankingIdentity.id || "MORALI…"}</span>
                </div>
                <div className={`banking-copy-indicator ${copiedIdentityField === "id" ? "success" : ""}`}>
                  {copiedIdentityField === "id" ? "✓" : "⧉"}
                </div>
              </div>
              <div className="banking-identity-card" onClick={() => copyToClipboard("rib", bankingIdentity.rib)}>
                <div className="banking-identity-copy">
                  <span className="banking-identity-label">VOTRE RIB MOKG</span>
                  <span className="banking-identity-value">{bankingIdentity.rib || "MOKG-…"}</span>
                </div>
                <div className={`banking-copy-indicator ${copiedIdentityField === "rib" ? "success" : ""}`}>
                  {copiedIdentityField === "rib" ? "✓" : "⧉"}
                </div>
              </div>
            </section>
            <div className="edit-avatar-section">
              <div className="profile-avatar grad-blue small">
                <span className="avatar-text">{(profileForm.fullName || "P").charAt(0).toUpperCase()}</span>
              </div>
              <button className="btn-change-photo" onClick={() => showToast("Changement de photo bientôt disponible")}>Changer la photo</button>
            </div>
            <div className="edit-form">
              <div className="input-group-glass">
                <label>Nom complet</label>
                <input type="text" value={profileForm.fullName} placeholder="Ton nom" onChange={(e) => setProfileForm((current) => ({ ...current, fullName: e.target.value }))} />
              </div>
              <div className="input-group-glass">
                <label>Numéro de téléphone</label>
                <input type="tel" value={profileForm.phone} placeholder="Ton numéro" onChange={(e) => setProfileForm((current) => ({ ...current, phone: e.target.value }))} />
              </div>
              <div className="input-group-glass">
                <label>Adresse de résidence</label>
                <input type="text" value={profileForm.address} placeholder="Ton adresse" onChange={(e) => setProfileForm((current) => ({ ...current, address: e.target.value }))} />
              </div>
            </div>

            {/* KYC Status */}
            <div style={{ padding: "14px 16px", borderRadius: 16, background: `${kycConfig.bg}`, border: `1px solid ${kycConfig.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: kycConfig.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    {kycLevel === 3 ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : kycLevel >= 2 ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Niveau KYC</div>
                    <div style={{ fontSize: 10, color: kycConfig.color, fontWeight: 700 }}>{kycConfig.text}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: kycConfig.color }}>{kycConfig.pct}</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[1, 2, 3].map((step) => (
                  <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, background: step <= kycLevel ? kycConfig.color : "rgba(255,255,255,.06)", transition: "background .3s" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748b", marginBottom: 12 }}>
                <span style={kycLevel >= 1 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Nom</span>
                <span style={kycLevel >= 2 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Téléphone</span>
                <span style={kycLevel >= 3 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Document</span>
              </div>
              {kycFirestoreStatus === "approved" ? (
                <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, padding: "8px 0" }}>Votre identité a été vérifiée avec succès.</div>
              ) : kycFirestoreStatus === "submitted" || kycFirestoreStatus === "under_review" ? (
                <div style={{ fontSize: 11, color: "#eab308", fontWeight: 600, padding: "8px 0" }}>Vos documents sont en cours de vérification par notre équipe.</div>
              ) : kycFirestoreStatus === "rejected" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Vérification rejetée. Veuillez soumettre de nouveaux documents.</div>
                  <button className="btn-save-elite" onClick={openKycModal} style={{ fontSize: 12, padding: "8px 16px" }}>Ressoumettre mes documents</button>
                </div>
              ) : (
                <button className="btn-save-elite" onClick={openKycModal} style={{ fontSize: 12, padding: "8px 16px" }}>Vérifier mon identité</button>
              )}
            </div>

            <button className="btn-save-elite" onClick={saveProfileInfos}>Mettre à jour le profil</button>
          </div>
        </div>

        {cardManageOpen && (
          <div className="card-modal-overlay" onClick={closeManageCardModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Paramètres</div>
                  <div className="bc-title">Gérer la carte</div>
                  <div className="bc-subtitle">Contrôlez votre carte Morali avec des réglages premium et instantanés.</div>
                </div>
                <button className="bc-close" onClick={closeManageCardModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Carte verrouillée</div>
                    <div className="card-setting-copy">Bloquez temporairement les paiements de la carte.</div>
                  </div>
                  <div className={`mini-switch ${cardLocked ? "active" : ""}`} role="switch" aria-checked={cardLocked} tabIndex={0} onClick={() => setCardLocked((current) => !current)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardLocked((current) => !current); } }} />
                </div>

                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Paiements en ligne</div>
                    <div className="card-setting-copy">Autoriser les achats web et abonnements sécurisés.</div>
                  </div>
                  <div className={`mini-switch ${cardSettings.online ? "active" : ""}`} role="switch" aria-checked={cardSettings.online} tabIndex={0} onClick={() => setCardSettings((current) => ({ ...current, online: !current.online }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardSettings((current) => ({ ...current, online: !current.online })); } }} />
                </div>

                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">International</div>
                    <div className="card-setting-copy">Activer la carte hors Congo et pour les services mondiaux.</div>
                  </div>
                  <div className={`mini-switch ${cardSettings.international ? "active" : ""}`} role="switch" aria-checked={cardSettings.international} tabIndex={0} onClick={() => setCardSettings((current) => ({ ...current, international: !current.international }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardSettings((current) => ({ ...current, international: !current.international })); } }} />
                </div>
              </div>

              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div className="pin-kicker" style={{ color: "rgba(96,165,250,.55)" }}>Statistiques</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Plafond journalier</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>750 000 <span style={{ fontSize: 10, color: "#64748b" }}>FCFA</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Retrait ATM</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: cardSettings.atm ? "#34d399" : "#f87171" }}>{cardSettings.atm ? "Actif" : "Désactivé"}</div>
                  </div>
                </div>
              </div>

              <button className="bc-btn-full" onClick={saveCardSettings}>Enregistrer les réglages</button>
            </div>
          </div>
        )}

        {cardPinOpen && (
          <div className="card-modal-overlay" onClick={closePinModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Sécurité</div>
                  <div className="bc-title">Code PIN</div>
                  <div className="bc-subtitle">Protégez votre carte avec un code PIN à 4 chiffres.</div>
                </div>
                <button className="bc-close" onClick={closePinModal} aria-label="Fermer">&times;</button>
              </div>

              {cardPinStage === "setup" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Créer votre code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Choisissez 4 chiffres faciles à retenir mais difficiles à deviner.</div>
                  </div>

                  <div className="pin-display">
                    <div className="pin-dots">
                      {[0,1,2,3].map(i => <div key={i} className={`pin-dot ${cardPinDraft.length > i ? "filled" : ""}`} />)}
                    </div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinDraft} onChange={(event) => setCardPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer le code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinConfirm} onChange={(event) => setCardPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                  </div>

                  <button className="bc-btn-full" onClick={saveCardPinCode} disabled={cardPinDraft.length !== 4 || cardPinConfirm.length !== 4} style={cardPinDraft.length !== 4 || cardPinConfirm.length !== 4 ? { opacity: .4 } : {}}>
                    Enregistrer le code PIN
                  </button>

                  <div className="bc-notice">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div className="bc-notice-text">Ce code sera demandé pour confirmer certaines opérations sensibles sur votre carte.</div>
                  </div>
                </div>
              ) : cardPinStage === "menu" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="pin-display">
                    <div className="pin-kicker">Code PIN actif</div>
                    <div className="pin-code">{cardPinRevealed && revealedPinDigits ? revealedPinDigits : "• • • •"}</div>
                  </div>

                  <div className="bc-notice" style={{ background: "rgba(34,197,94,.04)", borderColor: "rgba(34,197,94,.12)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <div className="bc-notice-text">Votre carte Morali est protégée par un code PIN sécurisé.</div>
                  </div>

                  <div className="pin-actions-row">
                    <button className="pin-action-btn" onClick={() => { setCardPinStage("reveal"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Afficher
                    </button>
                    <button className="pin-action-btn" onClick={() => { setCardPinDraft(""); setCardPinConfirm(""); setCardPinStage("change"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Modifier
                    </button>
                    <button className="pin-action-btn" style={{ color: "#fbbf24" }} onClick={() => { resetPinResetState(); setCardPinStage("reset"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                      PIN oublié
                    </button>
                  </div>

                  <button className="bc-btn-full bc-btn-secondary" onClick={closePinModal}>Fermer</button>
                </div>
              ) : cardPinStage === "reveal" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* PIN revealed successfully */}
                  {cardPinRevealed && revealedPinDigits ? (
                    <>
                      <div className="pin-display">
                        <div className="pin-kicker">Votre code PIN</div>
                        <div className="pin-code revealed">{revealedPinDigits}</div>
                      </div>
                      <div className="bc-actions">
                        <button className="bc-btn bc-btn-secondary" onClick={() => { setCardPinStage("menu"); setCardPinRevealed(false); setRevealAccountPw(""); }}>Retour</button>
                        <button className="bc-btn bc-btn-primary" onClick={() => setCardPinStage("menu")}>OK</button>
                      </div>
                    </>
                  ) : revealNeedsPin ? (
                    /* PIN not encrypted yet — first-time verification needed */
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Confirmez votre PIN</div>
                        <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>
                          Pour des raisons de sécurité, saisissez votre code PIN à 4 chiffres. 
                          <span style={{ color: "#fbbf24", fontWeight: 700 }}> Cette étape ne se fera qu'une seule fois.</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 12, background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.12)" }}>
                        <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600 }}>✓ Mot de passe vérifié avec succès</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Votre code PIN</div>
                          <input
                            className="bc-field-input"
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            value={revealPinRaw}
                            onChange={(event) => setRevealPinRaw(event.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="••••"
                            style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <button
                        className="bc-btn-full"
                        onClick={encryptAndRevealPin}
                        disabled={revealPinRaw.length !== 4 || revealPinVerifying}
                        style={revealPinRaw.length !== 4 || revealPinVerifying ? { opacity: .4 } : {}}
                      >
                        {revealPinVerifying ? <div className="btn-loader" /> : "Vérifier et afficher"}
                      </button>
                      <button className="bc-btn bc-btn-secondary" onClick={() => { setRevealNeedsPin(false); setRevealPinRaw(""); setRevealVerifiedPw(""); setCardPinStage("menu"); }}>Annuler</button>
                    </>
                  ) : (
                    /* Default: ask for account password */
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Vérification de sécurité</div>
                        <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Entrez le mot de passe de votre compte Morali pour afficher votre code PIN.</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Mot de passe du compte</div>
                          <input
                            className="bc-field-input"
                            type="password"
                            value={revealAccountPw}
                            onChange={(event) => setRevealAccountPw(event.target.value)}
                            placeholder="Votre mot de passe"
                            style={{ textAlign: "center", fontSize: 16, fontWeight: 700 }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <button
                        className="bc-btn-full"
                        onClick={revealPinWithPassword}
                        disabled={!revealAccountPw.trim() || revealVerifying || revealLockedUntil > Date.now()}
                        style={!revealAccountPw.trim() || revealVerifying || revealLockedUntil > Date.now() ? { opacity: .4 } : {}}
                      >
                        {revealVerifying ? <div className="btn-loader" /> : revealLockedUntil > Date.now() ? "Verrouillé" : "Vérifier et afficher"}
                      </button>
                      {revealLockedUntil > Date.now() && (
                        <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.15)" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171" }}>Trop de tentatives incorrectes</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Réessayez dans quelques minutes</div>
                        </div>
                      )}
                      {revealAttempts > 0 && revealLockedUntil <= Date.now() && (
                        <div style={{ textAlign: "center", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>{3 - revealAttempts} tentative(s) restante(s)</div>
                      )}
                      <div className="bc-actions">
                        <button className="bc-btn bc-btn-secondary" onClick={() => { setCardPinStage("menu"); setRevealAccountPw(""); }}>Retour</button>
                      </div>
                    </>
                  )}

                </div>
              ) : cardPinStage === "reset" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Réinitialiser le code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Un code de confirmation sera envoyé à votre email pour vérifier votre identité.</div>
                  </div>

                  {!pinResetOtpSent ? (
                    <>
                      <div className="bc-notice" style={{ background: "rgba(251,191,36,.04)", borderColor: "rgba(251,191,36,.12)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                        <div className="bc-notice-text">Le code sera envoyé à : <strong style={{ color: "#fbbf24" }}>{firebaseAuth.currentUser?.email || "..."}</strong></div>
                      </div>
                      <button className="bc-btn-full" onClick={sendPinResetOtp} disabled={pinResetSending} style={pinResetSending ? { opacity: .4 } : {}}>
                        {pinResetSending ? <div className="btn-loader" /> : "Envoyer le code par email"}
                      </button>
                    </>
                  ) : !pinResetVerified ? (
                    <>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Code de confirmation</div>
                          <input
                            className="bc-field-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinResetOtpCode}
                            onChange={(event) => setPinResetOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }}
                            autoFocus
                          />
                        </div>
                      </div>

                      {pinResetDemoOtp && (
                        <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 12, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.12)" }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", letterSpacing: ".1em", textTransform: "uppercase" }}>Mode démo</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: ".2em", marginTop: 2 }}>{pinResetDemoOtp}</div>
                        </div>
                      )}

                      <button className="bc-btn-full" onClick={verifyPinResetOtp} disabled={pinResetOtpCode.length !== 6 || pinResetVerifying} style={pinResetOtpCode.length !== 6 || pinResetVerifying ? { opacity: .4 } : {}}>
                        {pinResetVerifying ? <div className="btn-loader" /> : "Vérifier le code"}
                      </button>

                      <div style={{ textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Pas de code ? </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", cursor: "pointer" }} onClick={sendPinResetOtp}>Renvoyer</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bc-notice" style={{ background: "rgba(34,197,94,.04)", borderColor: "rgba(34,197,94,.12)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        <div className="bc-notice-text">Email vérifié ! Créez votre nouveau code PIN.</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Nouveau code PIN</div>
                          <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={pinResetNewPin} onChange={(event) => setPinResetNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                        </div>
                        <div className="bc-field">
                          <div className="bc-field-label">Confirmer le code PIN</div>
                          <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={pinResetConfirmPin} onChange={(event) => setPinResetConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                        </div>
                      </div>
                      <button className="bc-btn-full" onClick={resetPinWithNewCode} disabled={pinResetNewPin.length !== 4 || pinResetConfirmPin.length !== 4 || pinResetNewPin !== pinResetConfirmPin} style={pinResetNewPin.length !== 4 || pinResetConfirmPin.length !== 4 || pinResetNewPin !== pinResetConfirmPin ? { opacity: .4 } : {}}>
                        Réinitialiser le PIN
                      </button>
                    </>
                  )}

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => { resetPinResetState(); setCardPinStage("menu"); }}>Retour</button>
                  </div>
                </div>
              ) : (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Modifier le code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Saisissez l\'ancien puis le nouveau code PIN.</div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Ancien code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinPassword} onChange={(event) => setCardPinPassword(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Nouveau code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinDraft} onChange={(event) => setCardPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer nouveau code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinConfirm} onChange={(event) => setCardPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-notice" style={{ background: "rgba(59,130,246,.04)", borderColor: "rgba(59,130,246,.12)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      <div className="bc-notice-text">Le mot de passe du compte est optionnel. Saisissez-le pour pouvoir afficher votre PIN plus tard.</div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Mot de passe du compte <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>(optionnel)</span></div>
                      <input
                        className="bc-field-input"
                        type="password"
                        value={changePinAccountPw}
                        onChange={(event) => setChangePinAccountPw(event.target.value)}
                        placeholder="Votre mot de passe"
                        style={{ textAlign: "center", fontSize: 16, fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <button className="bc-btn-full" onClick={changeCardPinCode} disabled={cardPinPassword.length !== 4 || cardPinDraft.length !== 4 || cardPinConfirm.length !== 4} style={cardPinPassword.length !== 4 || cardPinDraft.length !== 4 || cardPinConfirm.length !== 4 ? { opacity: .4 } : {}}>
                    Mettre à jour le PIN
                  </button>

                  <button className="bc-btn-full bc-btn-secondary" onClick={() => { setCardPinDraft(""); setCardPinConfirm(""); setCardPinPassword(""); setChangePinAccountPw(""); setCardPinStage("menu"); }}>Annuler</button>
                </div>
              )}

            </div>
          </div>
        )}

        {cardLimitsOpen && (
          <div className="card-modal-overlay" onClick={closeCardLimitsModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Plafonds</div>
                  <div className="bc-title">Limites &amp; Plafonds</div>
                  <div className="bc-subtitle">Référentiel local inspiré des plafonds opérateurs MTN MoMo et Airtel Money au Congo-Brazzaville.</div>
                </div>
                <button className="bc-close" onClick={closeCardLimitsModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, textAlign: "left" }}>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Virement / transaction</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>500 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Paiement marchand</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>1 000 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Quotidien conseillé</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>1 500 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Solde maximum</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>5 000 000 FCFA</div>
                  </div>
                </div>
              </div>

              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#D4A437", marginRight: 6 }}>&#9679;</span>Référence MTN MoMo Congo</div>
                    <div className="card-setting-copy">Cash-out observé jusqu&apos;à 500 000 FCFA par opération, P2P et paiements élevés selon profil vérifié.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#f87171", marginRight: 6 }}>&#9679;</span>Référence Airtel Money Congo</div>
                    <div className="card-setting-copy">Compte standard à vérifié : plafond journalier observé entre 500 000 et 2 000 000 FCFA selon niveau KYC.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#60a5fa", marginRight: 6 }}>&#9679;</span>Politique Morali Carte</div>
                    <div className="card-setting-copy">Votre carte applique une limite prudente locale pour réduire les risques et rester compatible avec les rails Mobile Money du Congo.</div>
                  </div>
                </div>
              </div>

              <div className="bc-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div className="bc-notice-text">Conseil : pour des montants plus élevés, vérifiez votre identité complète et activez les plafonds premium auprès du support Morali.</div>
              </div>

              <button className="bc-btn-full" onClick={() => { closeCardLimitsModal(); showToast("Plafonds carte consultés"); }}>Compris</button>
            </div>
          </div>
        )}

        {receiptsOpen && (
          <div className="card-modal-overlay" onClick={closeReceiptsModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Historique</div>
                  <div className="bc-title">Historique des Reçus</div>
                  <div className="bc-subtitle">Retrouvez les preuves d&apos;opérations Morali les plus récentes, prêtes à être vérifiées ou partagées.</div>
                </div>
                <button className="bc-close" onClick={closeReceiptsModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="card-manage-stack">
                {(liveTransactions.length ? liveTransactions : dashboardData.transactions).map((tx, index) => (
                  <div key={`${tx.name}-${tx.date}-${index}`} className="card-setting-row">
                    <div style={{ flex: 1 }}>
                      <div className="card-setting-title">{tx.name}</div>
                      <div className="card-setting-copy">{tx.date} · {tx.category}{tx.channel ? ` · ${tx.channel}` : ""}</div>
                      {tx.receiptId && <div className="card-setting-copy">ID reçu : {tx.receiptId}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="card-setting-title">{tx.amount}</div>
                      <div className="card-setting-copy">{tx.status === "failed" ? "Échec" : tx.status === "pending" ? "En attente" : "Reçu disponible"}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="bc-btn-full" onClick={closeReceiptsModal}>Fermer</button>
            </div>
          </div>
        )}

        {supportOpen && (
          <div className="card-modal-overlay" onClick={closeSupportModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Support</div>
                  <div className="bc-title">Support Client</div>
                  <div className="bc-subtitle">Décrivez votre besoin. Morali enregistrera un ticket et le suivra depuis votre compte.</div>
                </div>
                <button className="bc-close" onClick={closeSupportModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="input-group-glass">
                <label>Votre message</label>
                <textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} placeholder="Ex : Virement non reçu, carte refusée, besoin d'assistance..." style={{ width: "100%", minHeight: 120, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 14, color: "#fff", outline: "none", fontSize: 15, resize: "none" }} />
              </div>
              {supportThreads.length > 0 && (
                <div className="card-manage-stack">
                  {supportThreads.map((thread) => (
                    <div key={thread.id} className="card-setting-row">
                      <div style={{ flex: 1 }}>
                        <div className="card-setting-title">{thread.message}</div>
                        <div className="card-setting-copy">{thread.createdAtLabel}</div>
                      </div>
                      <span className="profile-badge">{thread.status}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="bc-btn-full" onClick={submitSupportMessage} disabled={supportSending}>{supportSending ? "Envoi..." : "Envoyer au support"}</button>
            </div>
          </div>
        )}

        {termsOpen && (
          <div className="card-modal-overlay" onClick={closeTermsModal}>
            <div className="bc-modal legal-modal" onClick={(event) => event.stopPropagation()}>
              <button className="bc-close legal-modal-close" onClick={closeTermsModal} aria-label="Fermer">&times;</button>
              <LegalTerms mode="modal" onAccept={handleAcceptTerms} />
            </div>
          </div>
        )}

                {blackCardOpen && (
          <div className="card-modal-overlay" onClick={closeBlackCardModal} style={{ alignItems: "center", padding: "16px" }}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Morali Black</div>
                  <div className="bc-title">Demander votre Carte Black</div>
                  <div className="bc-subtitle">Votre passeport vers l&apos;excellence bancaire.</div>
                </div>
                <button className="bc-close" onClick={closeBlackCardModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="bc-steps">
                <div className={`bc-step-dot ${blackCardStep === "preview" ? "active" : blackCardStep === "material" || blackCardStep === "confirm" ? "done" : ""}`} />
                <div className={`bc-step-dot ${blackCardStep === "material" ? "active" : blackCardStep === "confirm" ? "done" : ""}`} />
                <div className={`bc-step-dot ${blackCardStep === "confirm" ? "active" : ""}`} />
              </div>

              {/* STEP 1: PREVIEW */}
              {blackCardStep === "preview" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="bc-card-preview">
                    <img src="/black-card-hero.png" alt="Carte Black" />
                    <div className="bc-card-preview-overlay">
                      <div className="bc-card-preview-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                        <span>Visa Infinite</span>
                      </div>
                    </div>
                  </div>

                  <div className="bc-features">
                    <div className="bc-feature">
                      <div className="bc-feature-icon gold">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">5M+ FCFA</div>
                        <div className="bc-feature-label">Plafond mensuel</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon blue">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">3.5%</div>
                        <div className="bc-feature-label">Cashback premium</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon green">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">24/7</div>
                        <div className="bc-feature-label">Conciergerie</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon rose">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">1 300+</div>
                        <div className="bc-feature-label">Lounges VIP</div>
                      </div>
                    </div>
                  </div>

                  <div className="bc-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div className="bc-notice-text">La Carte Black est réservée aux clients sélectionnés. Votre demande sera étudiée sous 24h.</div>
                  </div>

                  <button className="bc-btn-full" onClick={() => setBlackCardStep("material")}>
                    Continuer
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              )}

              {/* STEP 2: MATERIAL + INFO */}
              {blackCardStep === "material" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Choisissez votre finition</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>La matière de votre carte reflète votre style. Sélectionnez la finition qui vous correspond.</div>
                  </div>

                  <div className="bc-material-grid">
                    <div className={`bc-material-card ${blackCardMaterial === "steel" ? "selected" : ""}`} onClick={() => setBlackCardMaterial("steel")}>
                      <div className="bc-material-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                      <div className="bc-material-name">Acier Brossé</div>
                      <div className="bc-material-desc">Élégant, classique et intemporel</div>
                    </div>
                    <div className={`bc-material-card ${blackCardMaterial === "carbon" ? "selected" : ""}`} onClick={() => setBlackCardMaterial("carbon")}>
                      <div className="bc-material-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                      <div className="bc-material-name">Carbone Mat</div>
                      <div className="bc-material-desc">Moderne, léger et exclusif</div>
                    </div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Nom complet</div>
                      <input className="bc-field-input" placeholder="Ex: Emmanuel Morali" value={blackCardFullName} onChange={(e) => setBlackCardFullName(e.target.value)} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Téléphone</div>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#64748b", pointerEvents: "none" }}>+242</span>
                        <input className="bc-field-input" placeholder="XXXXXXXXX" value={blackCardPhone} onChange={(e) => setBlackCardPhone(e.target.value)} style={{ paddingLeft: 62 }} />
                      </div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Adresse de livraison</div>
                      <textarea className="bc-field-textarea" placeholder="Votre adresse complète pour la livraison" value={blackCardAddress} onChange={(e) => setBlackCardAddress(e.target.value)} />
                    </div>
                  </div>

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => setBlackCardStep("preview")}>Retour</button>
                    <button className="bc-btn bc-btn-primary" onClick={() => setBlackCardStep("confirm")} disabled={!blackCardFullName.trim() || !blackCardPhone.trim() || !blackCardAddress.trim()} style={!blackCardFullName.trim() || !blackCardPhone.trim() || !blackCardAddress.trim() ? { opacity: .4 } : {}}>
                      Confirmer
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRMATION */}
              {blackCardStep === "confirm" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="bc-confirm-card">
                    <div className="bc-confirm-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="bc-confirm-title">Confirmez votre demande</div>
                    <div className="bc-confirm-sub">Vérifiez les informations ci-dessous avant de soumettre votre demande de Carte Black.</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "4px 16px", borderRadius: 16, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
                    <div className="bc-confirm-row">
                      <span>Finition</span>
                      <span>{blackCardMaterial === "steel" ? "Acier Brossé" : "Carbone Mat"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Nom</span>
                      <span>{blackCardFullName || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Téléphone</span>
                      <span>{blackCardPhone || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Livraison</span>
                      <span>{blackCardAddress || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Plafond</span>
                      <span style={{ color: "#D4A437" }}>5M+ FCFA</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Frais</span>
                      <span style={{ color: "#4ade80" }}>Gratuit</span>
                    </div>
                  </div>

                  <div className="bc-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <div className="bc-notice-text">En soumettant, vous acceptez les conditions du Programme Black Morali. Votre conciergerie vous contactera sous 24h.</div>
                  </div>

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => setBlackCardStep("material")}>Retour</button>
                    <button className="bc-btn bc-btn-primary" onClick={requestBlackCard} disabled={blackCardLoading || blackCardData?.status === "requested"}>
                      {blackCardLoading ? <><div className="bc-loader" /> Envoi...</> : blackCardData?.status === "requested" ? "Forge en cours..." : "COMMANDER"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        

        {blackCardCelebrationOpen && (
          <div className="card-modal-overlay" onClick={() => setBlackCardCelebrationOpen(false)}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Morali Black</div>
                  <div className="bc-title">Bienvenue dans l’Exception</div>
                  <div className="bc-subtitle">Votre demande Morali Black a été enregistrée avec succès.</div>
                </div>
                <button className="bc-close" onClick={() => setBlackCardCelebrationOpen(false)} aria-label="Fermer">&times;</button>
              </div>
              <div className="card-manage-stack">
                <div className="black-request-banner" style={{ background: "linear-gradient(145deg,rgba(212,164,55,.14),rgba(255,255,255,.03))" }}>
                  <div className="black-request-meta">
                    <div className="black-request-title">Votre conciergerie vous contactera sous 24h</div>
                    <div className="black-request-sub">Votre carte en métal premium est en cours de forge. Livraison prioritaire sous 3 jours ouvrés.</div>
                  </div>
                </div>
                <div className="card-setting-row"><div><div className="card-setting-title">Statut de fabrication</div><div className="card-setting-copy">Forge en cours → Gravure laser → Expédition VIP</div></div></div>
              </div>
              <button className="bc-btn-full" onClick={() => { setBlackCardCelebrationOpen(false); closeBlackCardModal(); openPrivilegesTab(); }}>ACCÉDER À MON ESPACE PRIVILÈGE</button>
            </div>
          </div>
        )}

        {virtualCardOpen && (
          <div className="card-modal-overlay" onClick={closeVirtualCardModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Carte Digitale</div>
                  <div className="bc-title">Carte Virtuelle</div>
                  <div className="bc-subtitle">Une carte dédiée à vos achats en ligne et abonnements, séparée de votre carte principale.</div>
                </div>
                <button className="bc-close" onClick={closeVirtualCardModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, textAlign: "left" }}>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Numéro</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.number ?? "4482 •••• •••• 1187"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Expire</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.expiry ?? "09/28"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>CVV</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.cvv ?? "•••"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Fournisseur</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.provider ?? "Visa"}</div>
                  </div>
                </div>
              </div>
              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Alias</div>
                    <div className="card-setting-copy">{virtualCardData?.alias ?? "Morali Virtual Blue"}</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Usage web sécurisé</div>
                    <div className="card-setting-copy">Idéale pour les paiements e-commerce, abonnements SaaS et sandbox sans exposer la carte physique.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Plafond en ligne</div>
                    <div className="card-setting-copy">{formatCurrency(virtualCardData?.spendingLimit ?? 250000)} XAF par transaction pour un usage prudent.</div>
                  </div>
                  <div
                    className={`mini-switch ${(virtualCardData?.active && !virtualCardData?.frozen) ? "active" : ""}`}
                    role="switch"
                    aria-checked={virtualCardData?.active && !virtualCardData?.frozen}
                    tabIndex={0}
                    onClick={async () => {
                      if (!authUid || !virtualCardData) return;
                      const nextFrozen = !virtualCardData.frozen;
                      const nextCard = { ...virtualCardData, frozen: nextFrozen, updatedAt: serverTimestamp() };
                      setVirtualCardData(nextCard);
                      await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), nextCard, { merge: true });
                      showToast(nextFrozen ? "Carte virtuelle gelée" : "Carte virtuelle réactivée");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (async () => { if (!authUid || !virtualCardData) return; const nextFrozen = !virtualCardData.frozen; const nextCard = { ...virtualCardData, frozen: nextFrozen, updatedAt: serverTimestamp() }; setVirtualCardData(nextCard); await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), nextCard, { merge: true }); showToast(nextFrozen ? "Carte virtuelle gelée" : "Carte virtuelle réactivée"); })(); } }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="bc-btn-full bc-btn-secondary" onClick={closeVirtualCardModal}>Fermer</button>
                <button className="bc-btn-full bc-btn-primary" onClick={activateVirtualCard} disabled={virtualCardLoading}>{virtualCardLoading ? "Activation..." : virtualCardData?.active ? "Réactiver" : "Activer"}</button>
              </div>
            </div>
          </div>
        )}

        <QrScanner
          open={cameraScannerOpen}
          status={scannerStatus}
          videoRef={videoRef}
          canvasRef={canvasRef}
          onClose={closeCameraScanner}
          onRetry={openCameraScanner}
        />

        {/* ── KYC Verification Modal ── */}
        {kycModalOpen && (
          <div className="card-modal-overlay" onClick={closeKycModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Vérification</div>
                  <div className="bc-title">Vérification d'identité KYC</div>
                  <div className="bc-subtitle">
                    {kycStep === 1 && "Étape 1/3 — Informations du document"}
                    {kycStep === 2 && "Étape 2/3 — Photos du document"}
                    {kycStep === 3 && "Étape 3/3 — Selfie de vérification"}
                  </div>
                </div>
                <button className="btn-close-circle" onClick={closeKycModal} aria-label="Fermer">×</button>
              </div>
              <div className="bc-body" style={{ padding: 20 }}>
                {/* Progress */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  {[1, 2, 3].map((step) => (
                    <div key={step} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        background: step < kycStep ? "rgba(34,197,94,.15)" : step === kycStep ? "rgba(212,164,55,.15)" : "rgba(255,255,255,.04)",
                        border: step < kycStep ? "1.5px solid rgba(34,197,94,.4)" : step === kycStep ? "1.5px solid rgba(212,164,55,.4)" : "1.5px solid rgba(255,255,255,.08)",
                        transition: "all .3s",
                      }}>
                        {step < kycStep ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : step === kycStep ? (
                          <AppIcon name={step === 1 ? "document" : step === 2 ? "camera" : "user"} size={16} stroke="#D4A437" />
                        ) : (
                          <AppIcon name={step === 1 ? "document" : step === 2 ? "camera" : "user"} size={16} stroke="#475569" />
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: step === kycStep ? "#D4A437" : step < kycStep ? "#22c55e" : "#64748b", fontWeight: 600 }}>
                        {step === 1 ? "Infos" : step === 2 ? "Document" : "Selfie"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Step 1: Document type + info */}
                {kycStep === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="input-group-glass">
                      <label>Type de document</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {([
                          { value: "national_id", label: "CNI / Passeport", icon: "🪪" },
                          { value: "passport", label: "Passeport", icon: "📘" },
                          { value: "driver_license", label: "Permis", icon: "🚗" },
                        ] as const).map((opt) => (
                          <button key={opt.value} onClick={() => setKycDocType(opt.value)} style={{
                            flex: 1, padding: "10px 8px", borderRadius: 12, border: kycDocType === opt.value ? "2px solid #D4A437" : "1px solid rgba(255,255,255,.1)",
                            background: kycDocType === opt.value ? "rgba(212,164,55,.12)" : "rgba(255,255,255,.04)",
                            color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center", transition: "all .2s",
                          }}>
                            <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="input-group-glass">
                      <label>Numéro du document</label>
                      <input type="text" value={kycDocNumber} placeholder="Ex: D-12345678" onChange={(e) => setKycDocNumber(e.target.value)} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 14, width: "100%", outline: "none", padding: "8px 0" }} />
                    </div>
                    <div className="input-group-glass">
                      <label>Date de naissance</label>
                      <input type="date" value={kycDob} onChange={(e) => setKycDob(e.target.value)} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 14, width: "100%", outline: "none", padding: "8px 0" }} />
                    </div>
                    <div style={{ padding: "12px", borderRadius: 10, background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)" }}>
                      <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, marginBottom: 4 }}>Pourquoi la vérification ?</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>La vérification KYC est obligatoire pour débloquer les limites de transaction élevées et accéder aux services premium (Carte Black, micro-crédit). Vos documents sont sécurisés et traités par notre équipe.</div>
                    </div>
                    <button className="hub-cta" onClick={() => setKycStep(2)} disabled={!kycDocType} style={{ background: "#D4A437", color: "#000", opacity: kycDocType ? 1 : 0.4, cursor: kycDocType ? "pointer" : "not-allowed" }}>
                      Continuer
                    </button>
                  </div>
                )}

                {/* Step 2: Document photos */}
                {kycStep === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Front */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                        Recto du document {kycDocFront && <span style={{ color: "#22c55e" }}>✓</span>}
                      </div>
                      {kycDocFront ? (
                        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(34,197,94,.3)" }}>
                          <img src={kycDocFront} alt="Recto" style={{ width: "100%", height: 180, objectFit: "cover" }} />
                          <button onClick={() => setKycDocFront(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,.8)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>×</button>
                        </div>
                      ) : (
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, borderRadius: 12, border: "2px dashed rgba(255,255,255,.15)", cursor: "pointer", transition: "border-color .2s", background: "rgba(255,255,255,.03)" }}>
                          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) captureKycImage(e.target.files[0], setKycDocFront); }} />
                          <AppIcon name="camera" size={28} stroke="#64748b" />
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Prendre ou choisir la photo</span>
                        </label>
                      )}
                    </div>
                    {/* Back */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                        Verso du document {kycDocBack && <span style={{ color: "#22c55e" }}>✓</span>}
                        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 400, marginLeft: 6 }}>(optionnel)</span>
                      </div>
                      {kycDocBack ? (
                        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(34,197,94,.3)" }}>
                          <img src={kycDocBack} alt="Verso" style={{ width: "100%", height: 180, objectFit: "cover" }} />
                          <button onClick={() => setKycDocBack(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,.8)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>×</button>
                        </div>
                      ) : (
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, borderRadius: 12, border: "2px dashed rgba(255,255,255,.15)", cursor: "pointer", transition: "border-color .2s", background: "rgba(255,255,255,.03)" }}>
                          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) captureKycImage(e.target.files[0], setKycDocBack); }} />
                          <AppIcon name="camera" size={28} stroke="#64748b" />
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Prendre ou choisir la photo</span>
                        </label>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="hub-cta" onClick={() => setKycStep(1)} style={{ flex: 1, background: "rgba(255,255,255,.06)", color: "#94a3b8" }}>Retour</button>
                      <button className="hub-cta" onClick={() => setKycStep(3)} disabled={!kycDocFront} style={{ flex: 2, background: "#D4A437", color: "#000", opacity: kycDocFront ? 1 : 0.4, cursor: kycDocFront ? "pointer" : "not-allowed" }}>Continuer</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Selfie */}
                {kycStep === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                      Selfie de vérification {kycSelfie && <span style={{ color: "#22c55e" }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                      Prenez une photo de votre visage, bien éclairé, de face. Assurez-vous que votre visage est clairement visible.
                    </div>
                    {kycSelfie ? (
                      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(34,197,94,.3)" }}>
                        <img src={kycSelfie} alt="Selfie" style={{ width: "100%", height: 300, objectFit: "cover" }} />
                        <button onClick={() => { setKycSelfie(null); }} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,.8)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>×</button>
                      </div>
                    ) : (
                      <div style={{ borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,.1)", background: "#000", minHeight: 240 }}>
                        <video ref={kycSelfieVideoRef} autoPlay playsInline muted style={{ width: "100%", height: 240, objectFit: "cover" }} />
                        <canvas ref={kycSelfieCanvasRef} style={{ display: "none" }} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="hub-cta" onClick={() => setKycStep(2)} style={{ flex: 1, background: "rgba(255,255,255,.06)", color: "#94a3b8" }}>Retour</button>
                      {!kycSelfie && (
                        <button className="hub-cta" onClick={startKycSelfieCamera} style={{ flex: 1, background: "#3b82f6", color: "#fff" }}>Ouvrir caméra</button>
                      )}
                      {kycSelfie && (
                        <button className="hub-cta" onClick={submitKyc} disabled={kycSubmitting} style={{ flex: 2, background: "#22c55e", color: "#fff", opacity: kycSubmitting ? 0.5 : 1, cursor: kycSubmitting ? "wait" : "pointer" }}>
                          {kycSubmitting ? "Envoi en cours..." : "Soumettre mes documents"}
                        </button>
                      )}
                      {!kycSelfie && (
                        <button className="hub-cta" onClick={captureKycSelfie} style={{ flex: 1, background: "#D4A437", color: "#000" }}>Prendre la photo</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {securityModalOpen && (
          <div className="card-modal-overlay" onClick={closeSecurityModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Sécurité</div>
                  <div className="bc-title">Sécurité & Biométrie</div>
                  <div className="bc-subtitle">Pilotez les protections d’accès et les validations sensibles de votre compte Morali.</div>
                </div>
                <button className="bc-close" onClick={closeSecurityModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="security-modal-grid">
                <div className="security-feature" style={!biometricSupported ? { opacity: 0.55 } : {}}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Authentification biométrique</div>
                      {biometricSupported && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Disponible</span>}
                    </div>
                    <div className="security-feature-copy">{biometricSupported ? "Vérification par empreinte ou visage avant chaque transfert." : "Non disponible sur cet appareil ou navigateur."}</div>
                  </div>
                  <div
                    className={`mini-switch ${securitySettings.biometrics ? "active" : ""}`}
                    role="switch"
                    aria-checked={securitySettings.biometrics}
                    tabIndex={0}
                    style={!biometricSupported ? { pointerEvents: "none" } : {}}
                    onClick={() => biometricSupported && setSecuritySettings((c) => ({ ...c, biometrics: !c.biometrics }))}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && biometricSupported) { e.preventDefault(); setSecuritySettings((c) => ({ ...c, biometrics: !c.biometrics })); } }}
                  />
                </div>
                <div className="security-feature" style={!platformAuthSupported ? { opacity: 0.55 } : {}}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Face ID / Reconnaissance</div>
                      {platformAuthSupported && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Disponible</span>}
                    </div>
                    <div className="security-feature-copy">{platformAuthSupported ? "Validation par reconnaissance faciale pour les actions sensibles." : "Cet appareil ne supporte pas l’authentification faciale."}</div>
                  </div>
                  <div
                    className={`mini-switch ${securitySettings.faceId ? "active" : ""}`}
                    role="switch"
                    aria-checked={securitySettings.faceId}
                    tabIndex={0}
                    style={!platformAuthSupported ? { pointerEvents: "none" } : {}}
                    onClick={() => platformAuthSupported && setSecuritySettings((c) => ({ ...c, faceId: !c.faceId }))}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && platformAuthSupported) { e.preventDefault(); setSecuritySettings((c) => ({ ...c, faceId: !c.faceId })); } }}
                  />
                </div>
                <div className="security-feature">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Alertes nouvel appareil</div>
                      {securitySettings.deviceAlerts && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Actif</span>}
                    </div>
                    <div className="security-feature-copy">Notification instantanée si votre compte est accédé depuis un nouvel appareil.</div>
                  </div>
                  <div className={`mini-switch ${securitySettings.deviceAlerts ? "active" : ""}`} role="switch" aria-checked={securitySettings.deviceAlerts} tabIndex={0} onClick={() => setSecuritySettings((c) => ({ ...c, deviceAlerts: !c.deviceAlerts }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSecuritySettings((c) => ({ ...c, deviceAlerts: !c.deviceAlerts })); } }} />
                </div>
                <div className="security-feature">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Validation des transactions</div>
                      {securitySettings.transactionValidation && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(234,179,8,.15)", color: "#eab308", fontWeight: 800 }}>&#8805; 50 000 F</span>}
                    </div>
                    <div className="security-feature-copy">Confirmation supplémentaire pour tous les transferts à partir de 50 000 FCFA.</div>
                  </div>
                  <div className={`mini-switch ${securitySettings.transactionValidation ? "active" : ""}`} role="switch" aria-checked={securitySettings.transactionValidation} tabIndex={0} onClick={() => setSecuritySettings((c) => ({ ...c, transactionValidation: !c.transactionValidation }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSecuritySettings((c) => ({ ...c, transactionValidation: !c.transactionValidation })); } }} />
                </div>
              </div>

              <div className="security-summary">
                <div className="security-stat">
                  <div className="security-stat-kicker">Niveau de sécurité</div>
                  <div className="security-stat-value" style={{ color: Object.values(securitySettings).filter(Boolean).length === 4 ? "#22c55e" : Object.values(securitySettings).filter(Boolean).length >= 2 ? "#eab308" : "#ef4444" }}>
                    {Object.values(securitySettings).filter(Boolean).length === 4 ? "Élevé" : Object.values(securitySettings).filter(Boolean).length >= 2 ? "Moyen" : "Faible"}
                  </div>
                </div>
                <div className="security-stat">
                  <div className="security-stat-kicker">Sécurités actives</div>
                  <div className="security-stat-value">{Object.values(securitySettings).filter(Boolean).length} / 4</div>
                </div>
              </div>

              {passwordStage === "menu" ? (
                <>
                  <button style={{ width: "100%", height: 48, border: "none", borderRadius: 16, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 10px 24px rgba(59,130,246,.28)", marginTop: 4 }} onClick={saveSecuritySettings}>Enregistrer les changements</button>
                  <button style={{ width: "100%", height: 48, border: "1px solid rgba(59,130,246,.2)", borderRadius: 16, background: "rgba(59,130,246,.08)", color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => setPasswordStage("change")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Modifier le mot de passe
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="pin-action-btn" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, padding: 0 }} onClick={() => { setPasswordStage("menu"); setChangePwOld(""); setChangePwNew(""); setChangePwConfirm(""); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>Changer le mot de passe</div>
                  </div>

                  <div className="bc-notice" style={{ background: "rgba(251,191,36,.04)", borderColor: "rgba(251,191,36,.1)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                    <div className="bc-notice-text">Pour des raisons de sécurité, vous devez confirmer votre mot de passe actuel avant de le modifier.</div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Mot de passe actuel</div>
                      <input className="bc-field-input" type="password" value={changePwOld} onChange={(e) => setChangePwOld(e.target.value)} placeholder="Votre mot de passe actuel" autoComplete="current-password" />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Nouveau mot de passe</div>
                      <input className="bc-field-input" type="password" value={changePwNew} onChange={(e) => setChangePwNew(e.target.value)} placeholder="Min. 8 caractères" autoComplete="new-password" />
                      <div style={{ fontSize: 9, color: changePwNew.length >= 8 ? "#22c55e" : "#64748b", marginTop: 4, fontWeight: 700, transition: "color .2s" }}>
                        {changePwNew.length === 0 ? "Entrez un nouveau mot de passe" : changePwNew.length < 8 ? `${8 - changePwNew.length} caractère(s) requis` : "Force suffisante"}
                      </div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer le nouveau mot de passe</div>
                      <input className="bc-field-input" type="password" value={changePwConfirm} onChange={(e) => setChangePwConfirm(e.target.value)} placeholder="Répétez le nouveau mot de passe" autoComplete="new-password" style={changePwConfirm && changePwNew !== changePwConfirm ? { borderColor: "rgba(239,68,68,.35)" } : {}} />
                      {changePwConfirm && changePwNew !== changePwConfirm && (
                        <div style={{ fontSize: 9, color: "#f87171", marginTop: 4, fontWeight: 700 }}>Les mots de passe ne correspondent pas</div>
                      )}
                    </div>
                  </div>

                  <button
                    className="bc-btn-full"
                    onClick={handleChangePassword}
                    disabled={!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim() || changePwNew.length < 8 || changePwNew !== changePwConfirm || changePwLoading}
                    style={!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim() || changePwNew.length < 8 || changePwNew !== changePwConfirm || changePwLoading ? { opacity: .4 } : {}}
                  >
                    {changePwLoading ? <div className="btn-loader" /> : "Mettre à jour le mot de passe"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {privacyModalOpen && (
          <div className="card-modal-overlay" onClick={closePrivacyModal}>
            <div className={`bc-modal ${privacyTab === "policy" ? "legal-modal" : ""}`} onClick={(event) => event.stopPropagation()}>
              <button className="bc-close legal-modal-close" onClick={closePrivacyModal} aria-label="Fermer">&times;</button>
              {privacyTab === "policy" ? (
                <PrivacyPolicy mode="modal" onAccept={handleAcceptPrivacy} />
              ) : (
                <>
                  <div className="bc-head" style={{paddingTop: 0}}>
                    <div className="bc-head-left">
                      <div className="bc-kicker">Confidentialité</div>
                      <div className="bc-title">Paramètres de confidentialité</div>
                      <div className="bc-subtitle">Gérez la visibilité de votre profil et vos préférences de partage.</div>
                    </div>
                  </div>
              <div className="security-modal-grid">
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Profil visible aux autres clients</div>
                    <div className="security-feature-copy">Autoriser la découverte de votre pseudo Morali lors d’une recherche de virement.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.profileVisible ? "active" : ""}`} role="switch" aria-checked={privacySettings.profileVisible} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, profileVisible: !current.profileVisible }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, profileVisible: !current.profileVisible })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Masquage des activités sensibles</div>
                    <div className="security-feature-copy">Masquer automatiquement les montants sur les aperçus et reçus rapides.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.activityMasking ? "active" : ""}`} role="switch" aria-checked={privacySettings.activityMasking} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, activityMasking: !current.activityMasking }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, activityMasking: !current.activityMasking })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Analyses d’usage</div>
                    <div className="security-feature-copy">Partager des données anonymisées pour améliorer l’expérience Morali Pay.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.analyticsConsent ? "active" : ""}`} role="switch" aria-checked={privacySettings.analyticsConsent} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, analyticsConsent: !current.analyticsConsent }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, analyticsConsent: !current.analyticsConsent })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Communications marketing</div>
                    <div className="security-feature-copy">Recevoir des offres, nouveautés et invitations premium de Morali Pay.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.marketingConsent ? "active" : ""}`} role="switch" aria-checked={privacySettings.marketingConsent} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, marketingConsent: !current.marketingConsent }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, marketingConsent: !current.marketingConsent })); } }} />
                </div>
              </div>

              <div className="security-summary">
                <div className="security-stat">
                  <div className="security-stat-kicker">Centre de données</div>
                  <div className="security-stat-value privacy-region"><AppIcon name="shield" size={14} stroke="#60a5fa" />Région Afrique Centrale</div>
                  <div className="security-stat-kicker" style={{ marginTop: 6, textTransform: "none", letterSpacing: ".02em" }}>Conformité CEMAC / ANSSI Congo</div>
                </div>
                <div className="security-stat privacy-link-row" onClick={openAccessLog}>
                  <div className="security-stat-kicker">Journal d’accès</div>
                  <div className="security-stat-value">Disponible 30 jours</div>
                </div>
              </div>

              {privacyAccessLogOpen && (
                <div className="privacy-log">
                  {accessLogEntries.map((entry) => (
                    <div className="privacy-log-item" key={`${entry.place}-${entry.device}`}>
                      <div>
                        <div className="privacy-log-main">{entry.place} — {entry.device}</div>
                        <div className="privacy-log-sub">{entry.time}</div>
                      </div>
                    </div>
                  ))}
                  <button className="bc-btn-full" onClick={disconnectOtherDevices}>Déconnecter tous les autres appareils</button>
                </div>
              )}

              <button className={`btn-save-elite ${privacySaveState === "saving" ? "saving ripple" : privacySaveState === "saved" ? "saved" : ""}`} onClick={savePrivacySettings} disabled={privacySaveState !== "idle"}>
                {privacySaveState === "saving" ? "Enregistrement..." : privacySaveState === "saved" ? "Enregistré" : "Enregistrer la confidentialité"}
              </button>
                </>
              )}
            </div>
          </div>
        )}

        {privacyCloseConfirmOpen && (
          <div className="card-modal-overlay" onClick={cancelPrivacyClose}>
            <div className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="confirm-sheet-title">Modifications non enregistrées</div>
              <div className="confirm-sheet-copy">Certaines préférences de confidentialité n’ont pas encore été sauvegardées. Pour préserver vos réglages actuels, continuez l’édition ou confirmez la fermeture de cette fenêtre.</div>
              <div className="confirm-sheet-actions">
                <button type="button" className="secondary" onClick={cancelPrivacyClose}>Continuer l’édition</button>
                <button type="button" className="danger" onClick={discardPrivacyChanges}>Ignorer et fermer</button>
              </div>
            </div>
          </div>
        )}

        {transactionPinOpen && (
          <div className="transaction-flow-overlay" onClick={transactionProcessing ? undefined : closeTransactionPin}>
            <div className="transaction-flow-modal" onClick={(event) => event.stopPropagation()}>
              <div className="transaction-flow-head">
                <div>
                  <div className="transaction-flow-title">Code PIN</div>
                  <div className="transaction-flow-sub">Saisissez votre code secret à 4 chiffres pour sécuriser l’opération.</div>
                </div>
                {!transactionProcessing && !transactionSuccess && (
                  <button className="transaction-flow-close" onClick={closeTransactionPin} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                )}
              </div>

              {pendingPinAction ? (
                <div className="pin-summary">
                  <div>
                    <span>Opération</span>
                    <strong>{pendingPinAction.type === "merchant" ? "Paiement Marchand" : pendingPinAction.type === "savings_deposit" ? "Dépôt Épargne" : "Retrait Épargne"}</strong>
                  </div>
                  <div>
                    <span>Montant</span>
                    <strong>{formatCurrency(pendingPinAction.amount)} XAF</strong>
                  </div>
                </div>
              ) : (
                <div className="pin-summary">
                  <div>
                    <span>Opération</span>
                    <strong>{transactionType === "depot" ? "Dépôt" : "Retrait"}</strong>
                  </div>
                  <div>
                    <span>Destination</span>
                    <strong>Mobile Money</strong>
                  </div>
                  <div>
                    <small>Montant</small>
                    <strong>{formatCurrency(transactionNumericAmount)} XAF</strong>
                  </div>
                </div>
              )}

              {!transactionProcessing && !transactionSuccess && (
                <>
                  <div className="pin-dots">
                    {[0, 1, 2, 3].map((dot) => (
                      <div key={dot} className={`pin-dot ${transactionPinVerifying ? "verifying" : transactionPin.length > dot ? "filled" : ""}`} />
                    ))}
                  </div>
                  {transactionPinVerifying ? (
                    <div className="pin-helper" style={{ color: "#60a5fa" }}>Vérification du code PIN en cours…</div>
                  ) : (
                    <div className="pin-helper">Les chiffres restent masqués. La vérification démarre automatiquement au 4e appui.</div>
                  )}
                  <div className="pin-pad">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, index) => (
                      <button
                        key={`${key}-${index}`}
                        className={`pin-key ${key === "" ? "ghost" : ""}`}
                        onClick={() => key && handleTransactionPinKey(key)}
                        type="button"
                        disabled={transactionPinVerifying}
                      >
                        {key === "back" ? "⌫" : key}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {transactionProcessing && (
                <div className="pin-processing">
                  <div className="pin-loader" />
                  <div className="transaction-flow-title" style={{ fontSize: 16 }}>Traitement sécurisé...</div>
                  <div className="transaction-flow-sub" style={{ textAlign: "center" }}>Communication en cours avec les serveurs {transactionMethod === "mtn" ? "MTN" : "Airtel"}.</div>
                </div>
              )}

              {transactionSuccess && (
                <div className="pin-success">
                  <div className="pin-success-icon">✓</div>
                  <div className="transaction-flow-title" style={{ fontSize: 18 }}>Transaction réussie</div>
                  <div className="transaction-flow-sub" style={{ textAlign: "center" }}>Votre opération a été validée et sécurisée avec succès.</div>
                  <div className="transaction-flow-actions">
                    <button className="btn-save-elite" onClick={finishTransactionFlow}>Fermer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <NotificationsPanel notifications={notifications} open={notificationsOpen} unreadCount={unreadNotificationsCount} onClose={() => setNotificationsOpen(false)} onMarkAllRead={markAllNotificationsAsRead} onMarkRead={markNotificationAsRead} />

        {/* ── Device alert banner ── */}
        {deviceAlertShown && (
          <div style={{ position: "fixed", top: 16, left: 12, right: 12, zIndex: 10000, padding: "14px 16px", borderRadius: 16, background: "linear-gradient(135deg, rgba(239,68,68,.18), rgba(239,68,68,.08))", border: "1px solid rgba(239,68,68,.35)", backdropFilter: "blur(14px)", animation: "fadeIn .35s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>Nouvel appareil détecté</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Votre compte a été accédé depuis un appareil ou navigateur différent.</div>
              </div>
              <button onClick={() => setDeviceAlertShown(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", padding: 4 }}>&times;</button>
            </div>
          </div>
        )}

        {/* ── Transfer confirm sheet removed — moved to TransferView ── */}

        <div className={`toast ${toastVisible ? "show" : ""}`} role="status" aria-live="polite">{toastMessage}</div>
        {quickNotif && (
          <div className="quick-notif-overlay">
            <div className="quick-notif-card">
              <div className="quick-notif-ring" style={{ borderColor: quickNotif.color }}>
                <div className="quick-notif-ring" style={{ borderColor: quickNotif.color }}>
                  <div className="quick-notif-icon-wrap" style={{ borderColor: quickNotif.color, background: `${quickNotif.color}15` }}>
                    <AppIcon name={quickNotif.icon} size={28} stroke={quickNotif.color} />
                  </div>
                </div>
              </div>
              <div className="quick-notif-amount">
                {quickNotif.type === "credit" ? "+" : "-"}{quickNotif.amount}<span>FCFA</span>
              </div>
              <div className="quick-notif-label">{quickNotif.label}</div>
              <div className="quick-notif-badge" style={{ background: `${quickNotif.color}18`, color: quickNotif.color, border: `1px solid ${quickNotif.color}30` }}>
                {quickNotif.type === "credit" ? (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  Montant reçu</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                  Montant envoyé</>
                )}
              </div>
              <div className="quick-notif-progress">
                <div className="quick-notif-progress-bar" style={{ background: quickNotif.color }} />
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── ADMIN SCREENS delegated to AdminDashboard ── */}
      <AdminDashboard
        ref={adminRef}
        screen={screen}
        setScreen={setScreen}
        authUid={authUid}
        showToast={showToast}
        getAuthHeaders={getAuthHeaders}
        createRealtimeTransaction={createRealtimeTransaction}
        createRealtimeNotification={createRealtimeNotification}
        setLogoutModalOpen={setLogoutModalOpen}
        openTransactionChoice={() => setTransactionChoiceOpen(true)}
      />
    </>
          {/* Unified Logout Confirmation Modal */}
          {logoutModalOpen && (
            <div onClick={() => setLogoutModalOpen(false)} style={{position: "fixed", inset: 0, zIndex: 200000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px 20px", background: "rgba(3,8,16,.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)"}}>
              <div onClick={(e) => e.stopPropagation()} style={{position: "relative", width: "100%", maxWidth: 360, margin: "60px auto", padding: "28px 24px", background: "linear-gradient(180deg,#101a30 0%,#080f1e 100%)", border: "1px solid rgba(59,130,246,.22)", borderRadius: 28, display: "flex", flexDirection: "column", gap: 18}}>
                <div style={{width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </div>
                <div style={{fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8}}>Se déconnecter ?</div>
                <p style={{fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 1.5, marginBottom: 24}}>Voulez-vous vraiment vous déconnecter de votre compte Morali ?</p>
                <div style={{display: "flex", gap: 10}}>
                  <button onClick={() => setLogoutModalOpen(false)} style={{flex: 1, height: 48, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Annuler
                  </button>
                  <button onClick={() => {
                    setLogoutModalOpen(false);
                    // SECURITY: Revoke tokens server-side FIRST, then sign out client
                    fetch("/api/auth/logout", { method: "POST" })
                      .catch(() => {});
                    if (adminRef.current?.isAdminLoggedIn) {
                      adminRef.current.handleAdminLogout();
                    } else {
                      signOut(firebaseAuth).then(() => {
                        setScreen("auth");
                        setNavActive("Accueil");
                        showToast("Déconnexion effectuée");
                      }).catch(() => {
                        showToast("Erreur lors de la déconnexion");
                      });
                    }
                  }} style={{flex: 1, height: 48, borderRadius: 14, border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Se déconnecter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tontine Distribution Confirmation Modal */}
          {tontineDistConfirm && (
            <div className="transfer-overlay" onClick={() => setTontineDistConfirm(null)}>
              <div className="transfer-modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: 360, margin: "60px auto", padding: "28px 24px"}}>
                <div style={{width: 56, height: 56, borderRadius: "50%", background: "rgba(212,164,55,0.12)", border: "1.5px solid rgba(212,164,55,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
                </div>
                <div style={{fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8}}>Distribuer le pot ?</div>
                <p style={{fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 1.5, marginBottom: 16}}>
                  Distribuer <strong style={{color: "#fbbf24"}}>{formatCurrency(tontineDistConfirm.pot)} F</strong> entre {tontineDistConfirm.members} membres ?
                </p>
                <div style={{background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", marginBottom: 20}}>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: 13}}>
                    <span style={{color: "#64748b"}}>Part par membre</span>
                    <span style={{color: "#fbbf24", fontWeight: 800}}>{formatCurrency(tontineDistConfirm.sharePerMember)} F</span>
                  </div>
                </div>
                <div style={{display: "flex", gap: 10}}>
                  <button onClick={() => setTontineDistConfirm(null)} style={{flex: 1, height: 48, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Annuler
                  </button>
                  <button onClick={async () => {
                    const gi = tontineDistConfirm.groupIndex;
                    const sharePerMember = tontineDistConfirm.sharePerMember;
                    const group = tontineGroups[gi];
                    const totalMembers = group.members.filter((m) => (m as Record<string, unknown>).pseudo).length;
                    const next = tontineGroups.map((g: typeof group, idx: number) => idx === gi ? { ...g, pot: 0, members: g.members.map((m: typeof g.members[0]) => ({ ...m, paid: false })) } : g);
                    setTontineGroups(next);
                    saveTontineGroups(next);
                    setTontineDistConfirm(null);
                    serviceCreditBalance(sharePerMember);
                    createRealtimeTransaction({
                      senderUid: "tontine", senderMoraliId: "TONTINE", senderName: `Tontine ${group.name}`,
                      recipientUid: authUid || "", recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
                      amount: sharePerMember, fees: 0, type: "depot", destination: "cash", status: "success",
                      receiptId: "TN-" + Date.now().toString().slice(-8),
                    }).catch((err: unknown) => { console.error("Erreur transaction tontine:", err); });
                    createRealtimeNotification(authUid || "", {
                      title: `Tontine ${group.name} — Distribution de ${formatCurrency(sharePerMember)} F`,
                      time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
                      icon: "coins", bg: "rgba(212,164,55,0.12)", read: false,
                    }).catch((err: unknown) => { console.error("Erreur notification tontine:", err); });
                    showToast(`Distribution effectuée ! Vous recevez ${formatCurrency(sharePerMember)} F`);
                  }} style={{flex: 1, height: 48, borderRadius: 14, border: "none", background: "linear-gradient(135deg, rgba(212,164,55,0.2), rgba(212,164,55,0.1))", color: "#fbbf24", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Distribuer
                  </button>
                </div>
              </div>
            </div>
          )}
    </RenderGuard>
  );
}

export default App;
