'use client';
import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";

type AdminLoanRecord = any;
import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
  writeBatch,
  increment,
} from "firebase/firestore";
import { signOut, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { encryptPinWithPassword, decryptPinWithPassword } from "@/lib/pin-utils";
import { logAdminAction } from "@/lib/admin-logger";
import { formatCurrency } from "@/lib/helpers";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import type {
  AdminTab, FirestoreMoraliUser, FirestoreTransfer,
  AdminActivityLog, AdminConfirmAction, FirestoreNotification,
} from "@/types/morali";

// ── MoraliShield (duplicated from parent for self-containment) ──
function MoraliShield({ small = false }: { small?: boolean }) {
  const width = small ? 20 : 32;
  const height = small ? 24 : 38;
  const stroke = small ? 2.2 : 2;
  return (
    <svg width={width} height={height} viewBox="0 0 40 46" fill="none" aria-hidden="true">
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" fill="#1A3E78" />
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" stroke="#D4A437" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 29V17L20 23L29 17V29" stroke="#D4A437" strokeWidth={small ? 3.2 : 3} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export interface AdminDashboardProps {
  screen: string;
  setScreen: (s: any) => void;
  authUid: string | null;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  createRealtimeTransaction: (payload: FirestoreTransfer) => Promise<void>;
  createRealtimeNotification: (targetUid: string, item: FirestoreNotification) => Promise<void>;
  setLogoutModalOpen: (v: boolean) => void;
  openTransactionChoice: () => void;
}

export interface AdminDashboardHandle {
  isAdminLoggedIn: boolean;
  handleAdminLongPressStart: () => void;
  handleAdminLongPressEnd: () => void;
  handleAdminLogout: () => Promise<void>;
}

const AdminDashboard = forwardRef<AdminDashboardHandle, AdminDashboardProps>(function AdminDashboard(props, ref) {
  const { screen, setScreen, authUid, showToast, getAuthHeaders, createRealtimeTransaction, createRealtimeNotification, setLogoutModalOpen, openTransactionChoice } = props;

  // ── Admin Dashboard State ──
// ── Admin Dashboard State ──
const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
const [adminPermissionLevel, setAdminPermissionLevel] = useState<"full" | "viewer">("full");
const [resetDataConfirm, setResetDataConfirm] = useState<false | string>(false);
const [resetDataLoading, setResetDataLoading] = useState(false);
const [adminTab, setAdminTab] = useState<AdminTab>("overview");
const [adminAuthTab] = useState<"login">("login");
const [adminExistsChecked, setAdminExistsChecked] = useState(false);
const [adminExists, setAdminExists] = useState(false);
const [adminLoginEmail, setAdminLoginEmail] = useState("");
const [adminLoginEmailFetched, setAdminLoginEmailFetched] = useState(false);
const [adminLoginPassword, setAdminLoginPassword] = useState("");
const [adminLoginLoading, setAdminLoginLoading] = useState(false);
const [adminLoginError, setAdminLoginError] = useState("");
const [adminRegName, setAdminRegName] = useState("");
const [adminRegEmail, setAdminRegEmail] = useState("");
const [adminRegPassword, setAdminRegPassword] = useState("");
const [adminRegConfirm, setAdminRegConfirm] = useState("");
const [adminRegLoading, setAdminRegLoading] = useState(false);
const [adminForgotStep, setAdminForgotStep] = useState<"idle" | "email" | "code" | "newPassword" | "success">("idle");
const [adminForgotEmail, setAdminForgotEmail] = useState("");
const [adminForgotOtpCode, setAdminForgotOtpCode] = useState("");
const [adminForgotNewPw, setAdminForgotNewPw] = useState("");
const [adminForgotConfirmPw, setAdminForgotConfirmPw] = useState("");
const [adminForgotSending, setAdminForgotSending] = useState(false);
const [adminForgotVerifying, setAdminForgotVerifying] = useState(false);
const [adminForgotResetting, setAdminForgotResetting] = useState(false);
const [adminUsers, setAdminUsers] = useState<FirestoreMoraliUser[]>([]);
const [adminTransactions, setAdminTransactions] = useState<FirestoreTransfer[]>([]);
const [adminSearchQuery, setAdminSearchQuery] = useState("");
const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);

const [auditLogRefreshKey, setAuditLogRefreshKey] = useState(0);
const [adminSelectedUser, setAdminSelectedUser] = useState<FirestoreMoraliUser | null>(null);
const [adminTxFilter, setAdminTxFilter] = useState<"all" | "virement" | "depot" | "retrait" | "remboursement" | "contested">("all");
const [maintenanceMode, setMaintenanceMode] = useState(false);
const [defaultBalance, setDefaultBalance] = useState("0");
const [transferFee, setTransferFee] = useState("0");
const [maxTransferLimit, setMaxTransferLimit] = useState("1000000");
const [bankName, setBankName] = useState("Morali Pay");
const [adminLoading, setAdminLoading] = useState(false);
const adminLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const adminLongPressTriggered = useRef(false);
const [adminSelectedTx, setAdminSelectedTx] = useState<FirestoreTransfer | null>(null);
const [adminActivityLog, setAdminActivityLog] = useState<AdminActivityLog[]>([]);
const [adminBalanceEditAmount, setAdminBalanceEditAmount] = useState("");
const [adminBalanceEditMode, setAdminBalanceEditMode] = useState<"add" | "subtract" | null>(null);
const [adminNotifForm, setAdminNotifForm] = useState({ title: "", message: "", open: false });
const [adminConfirmAction, setAdminConfirmAction] = useState<AdminConfirmAction | null>(null);
const [adminTxDateFrom, setAdminTxDateFrom] = useState("");
const [adminTxDateTo, setAdminTxDateTo] = useState("");
const [adminLoans, setAdminLoans] = useState<Array<AdminLoanRecord>>([]);
const [adminLoansLoading, setAdminLoansLoading] = useState(false);
const [adminTxAmountMin, setAdminTxAmountMin] = useState("");
const [adminTxAmountMax, setAdminTxAmountMax] = useState("");
// ── New admin state: user management ──
const [adminSelectedUserIds, setAdminSelectedUserIds] = useState<Set<string>>(new Set());
const [adminUsersPage, setAdminUsersPage] = useState(1);
const [adminUsersPerPage, setAdminUsersPerPage] = useState(20);
const [adminEditingField, setAdminEditingField] = useState<string | null>(null);
const [adminEditValue, setAdminEditValue] = useState("");
// ── New admin state: transactions ──
const [adminTxPage, setAdminTxPage] = useState(1);
const [adminTxPerPage, setAdminTxPerPage] = useState(25);
// ── New admin state: finance ──
const [adminReportMode, setAdminReportMode] = useState<"daily" | "weekly" | "monthly">("daily");
const [adminFeeMode, setAdminFeeMode] = useState<"fixed" | "percentage">("fixed");
// ── New admin state: system ──
const [adminLastRefresh, setAdminLastRefresh] = useState<Date>(new Date());
const [adminBackupLoading, setAdminBackupLoading] = useState(false);
const [adminUserLimits, setAdminUserLimits] = useState<{ dailyLimit: string; txLimit: string }>({ dailyLimit: "", txLimit: "" });
const [adminLimitEditOpen, setAdminLimitEditOpen] = useState(false);
const adminRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

// ── Revenue tracking state ──
const [bankRevenue, setBankRevenue] = useState<{
  total: number;
  todayTotal: number;
  allTimeTotal: number;
  breakdown: Array<{ type: string; label: string; amount: number; percentage: number }>;
  recent: Array<{ id: string; type: string; amount: number; sourceName: string; description: string; createdAt: string }>;
} | null>(null);
const [revenuePeriod, setRevenuePeriod] = useState<"today" | "week" | "month" | "year" | "all">("month");

  // ── Admin Functions ──
// ── Admin Functions ──
const handleAdminLongPressStart = () => {
  adminLongPressTriggered.current = false;
  adminLongPressRef.current = setTimeout(() => {
    adminLongPressTriggered.current = true;
    setScreen("admin");
  }, 3000);
};

const handleAdminLongPressEnd = () => {
  if (adminLongPressRef.current) {
    clearTimeout(adminLongPressRef.current);
    adminLongPressRef.current = null;
  }
};

// ── Fetch admin email from server (frozen/readonly on the login form) ──
useEffect(() => {
  if (screen !== "admin" || isAdminLoggedIn || adminExistsChecked) return;
  (async () => {
    try {
      // Check if an admin exists (dynamic onboarding)
      const checkRes = await fetch("/api/admin/check-exists");
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        setAdminExists(checkData.adminExists);
        if (checkData.adminEmail) {
          setAdminLoginEmail(checkData.adminEmail);
          setAdminForgotEmail(checkData.adminEmail);
        }
        // If admin exists, force login tab
        if (checkData.adminExists) {
          // adminAuthTab is always "login" — no setter needed
        }
      }
    } catch {
      // Fallback: try legacy config endpoint
      try {
        const res = await fetch("/api/admin/config");
        if (res.ok) {
          const data = await res.json();
          if (data.email) {
            setAdminExists(true);
            setAdminLoginEmail(data.email);
            setAdminForgotEmail(data.email);
            // adminAuthTab is always "login" — no setter needed
          }
        }
      } catch {
        // No admin configured at all — allow registration
      }
    } finally {
      setAdminExistsChecked(true);
      setAdminLoginEmailFetched(true);
    }
  })();
}, [screen, isAdminLoggedIn, adminExistsChecked]);

// ── Admin forgot password handlers ──
const adminForgotSendCode = async () => {
  if (!adminForgotEmail.trim() || !adminForgotEmail.includes("@")) {
    showToast("Email invalide");
    return;
  }
  setAdminForgotSending(true);
  try {
    const res = await fetch("/api/auth/send-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminForgotEmail.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setAdminForgotStep("code");
    } else {
      showToast(data.error || "Erreur lors de l'envoi du code");
    }
  } catch {
    showToast("Erreur réseau");
  } finally {
    setAdminForgotSending(false);
  }
};

const adminForgotVerifyCode = async () => {
  if (adminForgotOtpCode.length !== 6) {
    showToast("Code à 6 chiffres requis");
    return;
  }
  setAdminForgotVerifying(true);
  try {
    const res = await fetch("/api/auth/verify-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminForgotEmail.trim(), code: adminForgotOtpCode }),
    });
    const data = await res.json();
    if (data.success) {
      setAdminForgotStep("newPassword");
    } else {
      showToast(data.error || "Code invalide");
    }
  } catch {
    showToast("Erreur réseau");
  } finally {
    setAdminForgotVerifying(false);
  }
};

const adminForgotResetPassword = async () => {
  if (adminForgotNewPw.length < 8) {
    showToast("Minimum 8 caractères");
    return;
  }
  if (adminForgotNewPw !== adminForgotConfirmPw) {
    showToast("Les mots de passe ne correspondent pas");
    return;
  }
  setAdminForgotResetting(true);
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminForgotEmail.trim(), code: adminForgotOtpCode, newPassword: adminForgotNewPw }),
    });
    const data = await res.json();
    if (data.success) {
      setAdminForgotStep("success");
    } else {
      showToast(data.error || "Erreur lors de la réinitialisation");
    }
  } catch {
    showToast("Erreur réseau");
  } finally {
    setAdminForgotResetting(false);
  }
};

const handleAdminLogin = async () => {
  setAdminLoginLoading(true);
  setAdminLoginError("");
  try {
    // SECURITY: Step 0 — Server-side credential verification via API
    // This adds a server-side gate: credentials are checked against ADMIN_EMAIL
    // and ADMIN_PASSWORD_HASH env vars (bcrypt). Even if Firebase Auth is bypassed,
    // the admin password must match the server-side hash.
    try {
      const loginRes = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminLoginEmail, password: adminLoginPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginData.success) {
        setAdminLoginError(loginData.error || "Identifiants incorrects.");
        setAdminLoginLoading(false);
        return;
      }
    } catch (fetchErr: unknown) {
      // API unreachable — log the error for debugging
      console.error("[ADMIN LOGIN] API fetch error:", fetchErr);
      // Don't block login entirely — proceed to Firebase Auth as fallback
      // The admin credentials are also verified server-side via bcrypt,
      // but Firebase Auth provides a secondary auth layer
    }

    // 1. Se connecter — si le compte Firebase n'existe pas, le créer automatiquement
    let cred;
    try {
      cred = await signInWithEmailAndPassword(firebaseAuth, adminLoginEmail, adminLoginPassword);
    } catch (signInErr: unknown) {
      const signInCode = typeof signInErr === "object" && signInErr && "code" in signInErr ? String((signInErr as { code?: string }).code || "") : "";
      // If user doesn't exist in Firebase Auth, create them (first-time admin setup)
      if (signInCode === "auth/user-not-found" || signInCode === "auth/invalid-credential") {
        try {
          const { createUserWithEmailAndPassword } = await import("firebase/auth");
          const newCred = await createUserWithEmailAndPassword(firebaseAuth, adminLoginEmail, adminLoginPassword);
          cred = newCred;
        } catch (createErr: unknown) {
          const createCode = typeof createErr === "object" && createErr && "code" in createErr ? String((createErr as { code?: string }).code || "") : "";
          if (createCode === "auth/email-already-in-use") {
            // Race condition: user was created between sign-in attempt and now — retry sign-in
            cred = await signInWithEmailAndPassword(firebaseAuth, adminLoginEmail, adminLoginPassword);
          } else {
            throw createErr;
          }
        }
      } else {
        throw signInErr;
      }
    }

    // 2. Vérifier/créer le rôle "admin" dans Firestore
    const userRef = doc(firebaseDb, "moraliUsers", cred.user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Auto-create admin profile in Firestore
      await setDoc(userRef, {
        email: adminLoginEmail.toLowerCase().trim(),
        displayName: "Administrateur",
        role: "admin",
        roleLevel: "full",
        createdAt: serverTimestamp(),
        isAdmin: true,
      });
    }

    const userData = (await getDoc(userRef)).data();
    if (userData?.role !== "admin") {
      setAdminLoginError("Accès refusé. Vous n'avez pas les droits administrateur.");
      await signOut(firebaseAuth);
      return;
    }
    // Set permission level: "full" for super-admin, "viewer" for read-only
    setAdminPermissionLevel(userData.roleLevel === "viewer" ? "viewer" : "full");

    setIsAdminLoggedIn(true);
    setAdminLoginEmail("");
    setAdminLoginPassword("");
  } catch (err: unknown) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code || "") : "";
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
      setAdminLoginError("Identifiants incorrects.");
    } else if (code === "auth/too-many-requests") {
      setAdminLoginError("Trop de tentatives. Réessayez plus tard.");
    } else {
      setAdminLoginError("Erreur de connexion. Vérifiez vos identifiants.");
    }
  } finally {
    setAdminLoginLoading(false);
  }
};

// ── Handle admin first-time registration ──
const handleAdminRegister = async () => {
  setAdminRegLoading(true);
  try {
    if (!adminRegEmail.trim() || !adminRegPassword) {
      showToast("Email et mot de passe requis");
      setAdminRegLoading(false);
      return;
    }
    if (!adminRegEmail.includes("@")) {
      showToast("Email invalide");
      setAdminRegLoading(false);
      return;
    }
    if (adminRegPassword.length < 8) {
      showToast("Mot de passe trop court (8 caractères min)");
      setAdminRegLoading(false);
      return;
    }
    if (adminRegPassword !== adminRegConfirm) {
      showToast("Les mots de passe ne correspondent pas");
      setAdminRegLoading(false);
      return;
    }

    const res = await fetch("/api/admin/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminRegEmail.trim().toLowerCase(),
        password: adminRegPassword,
        name: adminRegName.trim() || "Admin Morali Pay",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || "Erreur lors de la création");
      setAdminRegLoading(false);
      return;
    }

    // Admin created — switch to login tab, pre-fill email
    setAdminExists(true);
    // adminAuthTab is always "login" — no setter needed
    setAdminLoginEmail(adminRegEmail.trim().toLowerCase());
    setAdminForgotEmail(adminRegEmail.trim().toLowerCase());
    setAdminRegName("");
    setAdminRegEmail("");
    setAdminRegPassword("");
    setAdminRegConfirm("");
    showToast("Compte administrateur créé avec succès ! Connectez-vous.");
  } catch {
    showToast("Erreur lors de la création du compte");
  } finally {
    setAdminRegLoading(false);
  }
};

const handleAdminLogout = async () => {
  // SECURITY: Revoke all tokens on server (forces logout on ALL devices)
  try { await fetch("/api/auth/logout", { method: "POST", headers: await getAuthHeaders() }); } catch { /* best-effort */ }
  try { await signOut(firebaseAuth); } catch { /* ignore */ }
  setIsAdminLoggedIn(false);
  setAdminPermissionLevel("full");
  setAdminTab("overview");
  setAdminUsers([]);
  setAdminTransactions([]);
  setAdminSelectedUser(null);
  setAdminLoginError("");
  setLogoutModalOpen(false);
  setScreen("auth");
  showToast("Déconnexion effectuée");
};

const fetchAdminData = async () => {
  setAdminLoading(true);
  try {
    // Use server-side API (Admin SDK) instead of client-side Firestore
    // This ensures the dashboard always sees the latest data from both
    // "transactions" and "serverTransactions" collections, and all users
    // including those created via Admin API endpoints.
    const res = await fetch("/api/admin/fetch-data", {
      headers: await getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        setAdminUsers(data.users as FirestoreMoraliUser[]);
        setAdminTransactions(data.transactions as FirestoreTransfer[]);
        // Keep adminSelectedUser in sync with fresh data
        setAdminSelectedUser((prev) => {
          if (!prev) return prev;
          const fresh = (data.users as FirestoreMoraliUser[]).find((u) => u.uid === prev.uid);
          return fresh ? { ...prev, ...fresh } : prev;
        });
        return;
      }
    }
    // Fallback: client-side Firestore (if API fails)
    const [usersSnap, txSnap] = await Promise.all([
      getDocs(collection(firebaseDb, "moraliUsers")),
      getDocs(collection(firebaseDb, "transactions")),
    ]);
    const users = usersSnap.docs
      .map((d) => ({ uid: d.id, ...d.data() } as FirestoreMoraliUser))
      .filter((u) => (u as Record<string, unknown>).role !== "admin");
    const txs = txSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FirestoreTransfer & { id?: string }))
      .filter((d) => (d as Record<string, unknown>).type !== "__directory__" && (d as Record<string, unknown>).status !== "directory")
      .sort((a, b) => {
        const ta = a.createdAt && typeof a.createdAt === "object" && "seconds" in a.createdAt ? (a.createdAt as { seconds: number }).seconds * 1000 : 0;
        const tb = b.createdAt && typeof b.createdAt === "object" && "seconds" in b.createdAt ? (b.createdAt as { seconds: number }).seconds * 1000 : 0;
        return tb - ta;
      });
    setAdminUsers(users);
    setAdminTransactions(txs as FirestoreTransfer[]);
  } catch (err) {
    console.error("[fetchAdminData] Failed:", err);
  } finally {
    setAdminLoading(false);
  }
};

useEffect(() => {
  if (isAdminLoggedIn) {
    fetchAdminData();
    // Also fetch bank revenue data
    const fetchRevenue = async () => {
      try {
        const periodParam = revenuePeriod === "all" ? "year" : revenuePeriod;
        const res = await fetch(`/api/admin/revenue?period=${periodParam}`, { headers: await getAuthHeaders() });
        const data = await res.json();
        if (data.success) setBankRevenue(data);
      } catch { /* silent */ }
    };
    fetchRevenue();
  }
}, [isAdminLoggedIn, revenuePeriod]);

// Load loan applications for admin loans tab
useEffect(() => {
  if (isAdminLoggedIn && adminTab === "loans") {
    setAdminLoansLoading(true);
    // Load from transactions collection where destination is loan_request
    const q = query(collection(firebaseDb, "transactions"), where("destination", "==", "loan_request"));
    getDocs(q).then((snap) => {
      const loans = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
      loans.sort((a, b) => {
        const ta = ((a.createdAt as { seconds?: number })?.seconds) || 0;
        const tb = ((b.createdAt as { seconds?: number })?.seconds) || 0;
        return tb - ta;
      });
      setAdminLoans(loans);
    }).catch((err: unknown) => { console.error("Erreur chargement prêts admin:", err); showToast("Erreur de connexion"); }).finally(() => setAdminLoansLoading(false));
  }
}, [isAdminLoggedIn, adminTab]);

// Fetch audit logs when audit tab is selected
useEffect(() => {
  if (!isAdminLoggedIn || adminTab !== "audit" || !authUid) return;
  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/admin/audit-log?limit=50", { headers: await getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {}
  };
  fetchLogs();
}, [isAdminLoggedIn, adminTab, authUid, auditLogRefreshKey]);

const adminTotalBalance = useMemo(() => adminUsers.reduce((s, u) => s + (u.balance || 0), 0), [adminUsers]);
const adminTotalTransactions = useMemo(() => adminTransactions.reduce((s, t) => s + t.amount, 0), [adminTransactions]);
const adminTodayTransactions = useMemo(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  return adminTransactions.filter((t) => {
    if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
    return (t.createdAt as { seconds: number }).seconds * 1000 >= todayMs;
  }).length;
}, [adminTransactions]);

const filteredAdminUsers = useMemo(() => {
  if (!adminSearchQuery.trim()) return adminUsers;
  const q = adminSearchQuery.toLowerCase();
  return adminUsers.filter(
    (u) =>
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.moraliId || "").toLowerCase().includes(q) ||
      (u.pseudo || "").toLowerCase().includes(q)
  );
}, [adminUsers, adminSearchQuery]);

const filteredAdminTransactions = useMemo(() => {
  let result = adminTransactions;
  if (adminTxFilter !== "all") result = result.filter((t) => t.type === adminTxFilter);
  if (adminTxDateFrom) {
    const fromMs = new Date(adminTxDateFrom).setHours(0, 0, 0, 0);
    result = result.filter((t) => {
      if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
      return (t.createdAt as { seconds: number }).seconds * 1000 >= fromMs;
    });
  }
  if (adminTxDateTo) {
    const toMs = new Date(adminTxDateTo).setHours(23, 59, 59, 999);
    result = result.filter((t) => {
      if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
      return (t.createdAt as { seconds: number }).seconds * 1000 <= toMs;
    });
  }
  if (adminTxAmountMin) {
    const min = parseFloat(adminTxAmountMin);
    if (!isNaN(min)) result = result.filter((t) => t.amount >= min);
  }
  if (adminTxAmountMax) {
    const max = parseFloat(adminTxAmountMax);
    if (!isNaN(max)) result = result.filter((t) => t.amount <= max);
  }
  return result;
}, [adminTransactions, adminTxFilter, adminTxDateFrom, adminTxDateTo, adminTxAmountMin, adminTxAmountMax]);

const getAdminUserInitials = (user: FirestoreMoraliUser) => {
  const nameFallback = user.fullName || user.email?.split("@")[0] || "?";
  const first = (user.firstName || user.pseudo || nameFallback).charAt(0).toUpperCase();
  const last = (user.lastName || "").charAt(0).toUpperCase();
  return last ? first + last : first;
};

const formatAdminDate = (ts: unknown) => {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return "—";
  return new Date((ts as { seconds: number }).seconds * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const getAdminTxTypeLabel = (type: string) => {
  switch (type) {
    case "virement": return { label: "Virement", cls: "info" };
    case "depot": return { label: "Dépôt", cls: "success" };
    case "retrait": return { label: "Retrait", cls: "warning" };
    case "remboursement": return { label: "Remboursement", cls: "danger" };
    default: return { label: type, cls: "info" };
  }
};

const logAdminActivity = async (action: string, detail: string) => {
  setAdminActivityLog((prev) => [{ action, detail, timestamp: new Date() }, ...prev]);
  // Persister dans la DB via API (auth automatique via token)
  try {
    const headers = await getAuthHeaders();
    logAdminAction(action, detail, undefined, headers).catch((err: unknown) => { console.error("Erreur journal activité:", err); });
  } catch { /* token unavailable */ }
  // Auto-refresh audit log tab if visible
  setAuditLogRefreshKey((k) => k + 1);
};

const handleAdminBalanceEdit = async (mode: "add" | "subtract") => {
  if (!adminSelectedUser || !adminBalanceEditAmount) return;
  const amount = parseFloat(adminBalanceEditAmount);
  if (isNaN(amount) || amount <= 0) return;
  // Sécurité: vérifier solde suffisant pour un retrait
  if (mode === "subtract" && amount > (adminSelectedUser.balance || 0)) {
    showToast(`Solde insuffisant — disponible: ${formatCurrency(adminSelectedUser.balance || 0)} XAF`);
    return;
  }
  try {
    const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
    // Read current balance first (works even if doc doesn't exist yet)
    const userSnap = await getDoc(userRef);
    const currentBalance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
    const newBalance = mode === "add" ? currentBalance + amount : Math.max(0, currentBalance - amount);

    if (mode === "add") {
      // Use setDoc with merge to create document if it doesn't exist
      await setDoc(userRef, { balance: newBalance, updatedAt: serverTimestamp() }, { merge: true });
      const txReceiptId = `ADM-${Date.now()}`;
      // Écrire dans Firestore pour le dashboard + PostgreSQL pour l'historique
      await addDoc(collection(firebaseDb, "transactions"), {
        senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
        recipientUid: adminSelectedUser.uid, recipientMoraliId: adminSelectedUser.moraliId || "",
        recipientName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
        amount, fees: 0, type: "depot", status: "success", receiptId: txReceiptId,
        createdAt: serverTimestamp(),
      });
      await createRealtimeTransaction({
        senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
        recipientUid: adminSelectedUser.uid, recipientMoraliId: adminSelectedUser.moraliId || "",
        recipientName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
        amount, fees: 0, type: "depot", status: "success", receiptId: txReceiptId,
      });
      logAdminActivity("Dépôt de fonds", `+${formatCurrency(amount)} XAF → ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
      // Notifier l'utilisateur du dépôt
      await createRealtimeNotification(adminSelectedUser.uid, {
        title: `Dépôt reçu : ${formatCurrency(amount)} XAF`,
        time: new Date().toLocaleString("fr-FR"),
        badge: "Dépôt",
        badgeClass: "nb-green",
        icon: "wallet",
        bg: "rgba(34,197,94,0.12)",
        read: false,
      });
    } else {
      // Use setDoc with merge — works even if doc doesn't exist yet
      await setDoc(userRef, { balance: newBalance, updatedAt: serverTimestamp() }, { merge: true });
      const txReceiptId = `ADM-${Date.now()}`;
      // Écrire dans Firestore pour le dashboard + PostgreSQL pour l'historique
      await addDoc(collection(firebaseDb, "transactions"), {
        senderUid: adminSelectedUser.uid, senderMoraliId: adminSelectedUser.moraliId || "",
        senderName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
        recipientUid: "admin", recipientMoraliId: "admin", recipientName: "Admin Morali",
        amount, fees: 0, type: "retrait", status: "success", receiptId: txReceiptId,
        createdAt: serverTimestamp(),
      });
      await createRealtimeTransaction({
        senderUid: adminSelectedUser.uid, senderMoraliId: adminSelectedUser.moraliId || "",
        senderName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
        recipientUid: "admin", recipientMoraliId: "admin", recipientName: "Admin Morali",
        amount, fees: 0, type: "retrait", status: "success", receiptId: txReceiptId,
      });
      logAdminActivity("Retrait de fonds", `-${formatCurrency(amount)} XAF → ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
      // Notifier l'utilisateur du retrait
      await createRealtimeNotification(adminSelectedUser.uid, {
        title: `Retrait effectué : ${formatCurrency(amount)} XAF`,
        time: new Date().toLocaleString("fr-FR"),
        badge: "Retrait",
        badgeClass: "nb-blue",
        icon: "wallet",
        bg: "rgba(59,130,246,0.12)",
        read: false,
      });
    }
    setAdminBalanceEditAmount("");
    setAdminBalanceEditMode(null);
    setAdminUsers((prev) => prev.map((u) => u.uid === adminSelectedUser.uid ? { ...u, balance: (u.balance || 0) + (mode === "add" ? amount : -amount) } : u));
    setAdminSelectedUser((prev) => prev ? { ...prev, balance: (prev.balance || 0) + (mode === "add" ? amount : -amount) } : prev);
    fetchAdminData();
    showToast(mode === "add" ? "Fonds ajoutés avec succès" : "Fonds retirés avec succès");
  } catch (err) {
    console.error("Erreur modification solde:", err);
    showToast("Erreur lors de la modification du solde");
  }
};

const handleAdminSuspendUser = async () => {
  if (!adminSelectedUser) return;
  const isSuspended = adminSelectedUser.accountStatus === "suspended";
  try {
    const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
    await updateDoc(userRef, { accountStatus: isSuspended ? "active" : "suspended" });
    const newStatus = isSuspended ? "active" : "suspended";
    setAdminUsers((prev) => prev.map((u) => u.uid === adminSelectedUser.uid ? { ...u, accountStatus: newStatus as "active" | "suspended" } : u));
    setAdminSelectedUser((prev) => prev ? { ...prev, accountStatus: newStatus as "active" | "suspended" } : prev);
    logAdminActivity(isSuspended ? "Réactivation compte" : "Suspension compte", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} → ${newStatus}`);
    // Notifier l'utilisateur de la modification de son compte
    await createRealtimeNotification(adminSelectedUser.uid, {
      title: isSuspended ? "Votre compte a été réactivé" : "Votre compte a été suspendu",
      time: new Date().toLocaleString("fr-FR"),
      badge: isSuspended ? "Sécurité" : "Alerte",
      badgeClass: isSuspended ? "nb-green" : "nb-red",
      icon: "shield",
      bg: isSuspended ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
      read: false,
    });
  } catch (err) {
    /* suspend failed silently */
  }
};

const handleAdminDeleteUser = async () => {
  if (!adminSelectedUser) return;
  const uid = adminSelectedUser.uid;
  try {
    // 1. Try API first (Admin SDK bypasses Firestore rules)
    const apiRes = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ uid }),
    });
    const apiData = await apiRes.json().catch(() => ({}));

    if (apiData.success) {
      // API succeeded — full cleanup done server-side (including Firebase Auth disable)
      setAdminUsers((prev) => prev.filter((u) => u.uid !== uid));
      setAdminSelectedUser(null);
      setAdminConfirmAction(null);
      logAdminActivity("Suppression utilisateur", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} (${adminSelectedUser.email})`);
      showToast("Utilisateur supprimé — toutes les données Firebase nettoyées");
      return;
    }

    // 2. Fallback: client-side Firestore deletion
    await deleteDoc(doc(firebaseDb, "moraliUsers", uid));
    try { await deleteDoc(doc(firebaseDb, "pinRecords", uid)); } catch { }
    try { await deleteDoc(doc(firebaseDb, "kycRecords", uid)); } catch { }

    const sentSnap = await getDocs(query(collection(firebaseDb, "transactions"), where("senderUid", "==", uid)));
    if (!sentSnap.empty) {
      const batch1 = writeBatch(firebaseDb);
      sentSnap.docs.forEach((d) => batch1.delete(d.ref));
      await batch1.commit();
    }
    const recvSnap = await getDocs(query(collection(firebaseDb, "transactions"), where("recipientUid", "==", uid)));
    if (!recvSnap.empty) {
      const batch2 = writeBatch(firebaseDb);
      recvSnap.docs.forEach((d) => batch2.delete(d.ref));
      await batch2.commit();
    }

    setAdminUsers((prev) => prev.filter((u) => u.uid !== uid));
    setAdminSelectedUser(null);
    setAdminConfirmAction(null);
    logAdminActivity("Suppression utilisateur", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} (${adminSelectedUser.email})`);
    showToast("Utilisateur supprimé (mode fallback — Firebase Auth non désactivé)");
  } catch (err) {
    console.error("Erreur suppression utilisateur:", err);
    showToast("Erreur lors de la suppression : " + (err instanceof Error ? err.message : "Erreur inconnue"));
  }
};

const handleAdminResetPin = async () => {
  if (!adminSelectedUser) return;
  try {
    // SECURITY: PIN is stored client-side only (hashed).
    // Admin cannot set a PIN for another user — they can only
    // flag the account to require PIN re-setup on next login.
    const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
    await updateDoc(userRef, { pinResetRequired: true });
    logAdminActivity("Réinitialisation PIN", `PIN réinitialisé pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
    showToast("PIN réinitialisé — l'utilisateur devra créer un nouveau code");
    // Notifier l'utilisateur que son PIN a été réinitialisé
    await createRealtimeNotification(adminSelectedUser.uid, {
      title: "Votre code PIN a été réinitialisé",
      time: new Date().toLocaleString("fr-FR"),
      badge: "Sécurité",
      badgeClass: "nb-gold",
      icon: "lock",
      bg: "rgba(245,158,11,0.12)",
      read: false,
    });
  } catch {
    /* admin reset PIN failed silently */
    showToast("Échec de la réinitialisation PIN");
  }
};

const handleAdminRefund = async (tx: FirestoreTransfer) => {
  if (!tx || tx.type !== "virement") return;
  try {
    if (tx.recipientUid !== tx.senderUid) {
      const senderRef = doc(firebaseDb, "moraliUsers", tx.senderUid);
      const recipientRef = doc(firebaseDb, "moraliUsers", tx.recipientUid);
      await runTransaction(firebaseDb, async (txn) => {
        const [recipientDoc, senderDoc] = await Promise.all([txn.get(recipientRef), txn.get(senderRef)]);
        if (!recipientDoc.exists()) throw new Error("RECIPIENT_NOT_FOUND");
        if (!senderDoc.exists()) throw new Error("SENDER_NOT_FOUND");
        const recipientBal = recipientDoc.data().balance || 0;
        if (recipientBal < tx.amount) throw new Error("INSUFFICIENT_BALANCE");
        txn.update(recipientRef, { balance: recipientBal - tx.amount, updatedAt: serverTimestamp() });
        const senderBal = senderDoc.data().balance || 0;
        txn.update(senderRef, { balance: senderBal + tx.amount, updatedAt: serverTimestamp() });
      });
    } else {
      const senderRef = doc(firebaseDb, "moraliUsers", tx.senderUid);
      await updateDoc(senderRef, { balance: increment(tx.amount) });
    }
    // Create refund transaction record after successful balance operations
    await createRealtimeTransaction({
      senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
      recipientUid: tx.senderUid, recipientMoraliId: tx.senderMoraliId || "",
      recipientName: tx.senderName || "",
      amount: tx.amount, fees: 0, type: "remboursement", status: "success",
      receiptId: `REF-${Date.now()}`,
    });
    // Notify the sender about the refund
    try {
      await createRealtimeNotification(tx.senderUid, {
        title: `Remboursement reçu — +${formatCurrency(tx.amount)} FCFA`,
        time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
        icon: "refresh", bg: "rgba(34,197,94,0.12)", read: false,
      });
    } catch {}
    // Notify the recipient if different from sender
    if (tx.recipientUid && tx.recipientUid !== tx.senderUid) {
      try {
        await createRealtimeNotification(tx.recipientUid, {
          title: `Retrait virement — -${formatCurrency(tx.amount)} FCFA`,
          time: "À l'instant", badge: "Débit", badgeClass: "nb-blue",
          icon: "arrow-down", bg: "rgba(59,130,246,0.12)", read: false,
        });
      } catch {}
    }
    logAdminActivity("Remboursement", `Remboursement de ${formatCurrency(tx.amount)} XAF à ${tx.senderName}`);
    setAdminConfirmAction(null);
    setAdminSelectedTx(null);
    fetchAdminData();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "INSUFFICIENT_BALANCE") showToast("Solde du destinataire insuffisant pour le remboursement");
    else { /* refund failed silently */ }
  }
};

const handleAdminSendNotification = async () => {
  if (!adminSelectedUser || !adminNotifForm.title || !adminNotifForm.message) return;
  try {
    await createRealtimeNotification(adminSelectedUser.uid, {
      title: `${adminNotifForm.title}: ${adminNotifForm.message}`,
      time: new Date().toLocaleString("fr-FR"),
      badge: "Admin", badgeClass: "nb-blue", icon: "bell", bg: "rgba(59,130,246,0.12)", read: false,
    });
    logAdminActivity("Notification envoyée", `À ${adminSelectedUser.fullName || adminSelectedUser.pseudo}: "${adminNotifForm.title}"`);
    setAdminNotifForm({ title: "", message: "", open: false });
  } catch (err) {
    /* notification failed silently */
  }
};

const generateUsersCSV = () => {
  const headers = ["Nom", "Email", "Pseudo", "ID Morali", "Solde", "Statut", "Date inscription"];
  const rows = filteredAdminUsers.map((u) => [
    u.fullName || "",
    u.email || "",
    u.pseudo || "",
    u.moraliId || "",
    String(u.balance || 0),
    (u as Record<string, unknown>).accountStatus === "suspended" ? "Suspendu" : "Actif",
    formatAdminDate(u.createdAt),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "morali_users.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const generateTransactionsCSV = () => {
  const headers = ["Date", "Expéditeur", "Destinataire", "Montant", "Frais", "Type", "Statut", "Reçu"];
  const rows = filteredAdminTransactions.map((t) => [
    formatAdminDate(t.createdAt),
    t.senderName || t.senderMoraliId || "",
    t.recipientName || t.recipientMoraliId || "",
    String(t.amount),
    String(t.fees),
    t.type,
    t.status,
    t.receiptId || "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "morali_transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const exportFinancialReportPDF = async () => {
  try {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    doc.text("Morali Pay \u2014 Rapport Financier", 14, 22);

    // Period
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`P\u00e9riode : ${adminFinancialReport.rangeLabel}`, 14, 30);
    doc.text(`G\u00e9n\u00e9r\u00e9 le : ${new Date().toLocaleString("fr-FR")}`, 14, 36);

    // Summary stats
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("R\u00e9sum\u00e9", 14, 48);

    const summaryData = [
      ["Total D\u00e9p\u00f4ts", `${formatCurrency(adminFinancialReport.totalDepots)} XAF`],
      ["Total Retraits", `${formatCurrency(adminFinancialReport.totalRetraits)} XAF`],
      ["Total Virements", `${formatCurrency(adminFinancialReport.totalVirements)} XAF`],
      ["R\u00e9sultat Net", `${adminFinancialReport.net >= 0 ? "+" : ""}${formatCurrency(adminFinancialReport.net)} XAF`],
    ];

    autoTable(doc, {
      startY: 52,
      head: [["Indicateur", "Montant"]],
      body: summaryData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: "bold" } },
    });

    // Transaction table
    if (adminFinancialReport.transactions.length > 0) {
      const lastY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text("D\u00e9tail des transactions", 14, lastY);

      const txData = adminFinancialReport.transactions.slice(0, 50).map((tx: any) => [
        tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("fr-FR") : "\u2014",
        tx.type || "\u2014",
        tx.senderName || "\u2014",
        tx.recipientName || "\u2014",
        `${formatCurrency(tx.amount)} XAF`,
      ]);

      autoTable(doc, {
        startY: lastY + 6,
        head: [["Date", "Type", "De", "\u00c0", "Montant"]],
        body: txData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 3 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Morali Pay \u2014 Rapport confidentiel \u2014 Page ${i}/${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    doc.save(`Morali_Bank_Rapport_${adminReportMode}_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("Rapport PDF export\u00e9 avec succ\u00e8s");
  } catch (err) {
    console.error("PDF export error:", err);
    showToast("Erreur lors de l\u2019export PDF");
  }
};

// Analytics computations
const adminAnalyticsStats = useMemo(() => {
  const totalDepots = adminTransactions.filter((t) => t.type === "depot").reduce((s, t) => s + t.amount, 0);
  const totalRetraits = adminTransactions.filter((t) => t.type === "retrait").reduce((s, t) => s + t.amount, 0);
  const totalVirements = adminTransactions.filter((t) => t.type === "virement").reduce((s, t) => s + t.amount, 0);
  const avgBalance = adminUsers.length > 0 ? Math.round(adminUsers.reduce((s, u) => s + (u.balance || 0), 0) / adminUsers.length) : 0;
  return { totalDepots, totalRetraits, totalVirements, avgBalance };
}, [adminTransactions, adminUsers]);

const adminInscriptionsPerDay = useMemo(() => {
  const days: { label: string; count: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);
    const endMs = new Date(date);
    endMs.setHours(23, 59, 59, 999);
    const startMs = date.getTime();
    const count = adminUsers.filter((u) => {
      if (!u.createdAt || typeof u.createdAt !== "object" || !("seconds" in u.createdAt)) return false;
      const ms = (u.createdAt as { seconds: number }).seconds * 1000;
      return ms >= startMs && ms <= endMs.getTime();
    }).length;
    days.push({ label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }), count });
  }
  return days;
}, [adminUsers]);

const adminTxVolumePerDay = useMemo(() => {
  const days: { label: string; depot: number; retrait: number; virement: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);
    const endMs = new Date(date);
    endMs.setHours(23, 59, 59, 999);
    const startMs = date.getTime();
    let depot = 0, retrait = 0, virement = 0;
    adminTransactions.forEach((t) => {
      if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return;
      const ms = (t.createdAt as { seconds: number }).seconds * 1000;
      if (ms >= startMs && ms <= endMs.getTime()) {
        if (t.type === "depot") depot += t.amount;
        else if (t.type === "retrait") retrait += t.amount;
        else if (t.type === "virement") virement += t.amount;
      }
    });
    days.push({ label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }), depot, retrait, virement });
  }
  return days;
}, [adminTransactions]);

const adminTopUsersByVolume = useMemo(() => {
  const userVolumes: { uid: string; name: string; volume: number }[] = [];
  adminUsers.forEach((u) => {
    const vol = adminTransactions
      .filter((t) => t.senderUid === u.uid || t.recipientUid === u.uid)
      .reduce((s, t) => s + t.amount, 0);
    if (vol > 0) userVolumes.push({ uid: u.uid, name: u.fullName || u.pseudo || "—", volume: vol });
  });
  return userVolumes.sort((a, b) => b.volume - a.volume).slice(0, 5);
}, [adminUsers, adminTransactions]);

const submitTransaction = () => {
  openTransactionChoice();
};

// ── Real-time auto-refresh ──
useEffect(() => {
  if (isAdminLoggedIn && screen === "admin") {
    adminRefreshRef.current = setInterval(async () => {
      await fetchAdminData();
      setAdminLastRefresh(new Date());
    }, 8000);
  } else {
    if (adminRefreshRef.current) {
      clearInterval(adminRefreshRef.current);
      adminRefreshRef.current = null;
    }
  }
  return () => {
    if (adminRefreshRef.current) {
      clearInterval(adminRefreshRef.current);
      adminRefreshRef.current = null;
    }
  };
}, [isAdminLoggedIn, screen]);

// Update lastRefresh on initial fetch

const adminRefreshSeconds = useMemo(() => {
  return Math.floor((Date.now() - adminLastRefresh.getTime()) / 1000);
}, [adminLastRefresh]);

// Tick for refresh indicator
useEffect(() => {
  const iv = setInterval(() => setAdminLastRefresh((d) => new Date(d.getTime())), 1000);
  return () => clearInterval(iv);
}, []);

// ── User profile editing ──
const handleAdminEditProfileField = async (field: string) => {
  if (!adminSelectedUser || !adminEditValue.trim()) return;
  try {
    const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
    const updateData: Record<string, string> = {};
    if (field === "firstName") updateData.firstName = adminEditValue.trim();
    else if (field === "lastName") updateData.lastName = adminEditValue.trim();
    else if (field === "phone") updateData.phone = adminEditValue.trim();
    else if (field === "pseudo") updateData.pseudo = adminEditValue.trim();
    await updateDoc(userRef, updateData);
    // Also update fullName if firstName or lastName changed
    if (field === "firstName" || field === "lastName") {
      const newFirst = field === "firstName" ? adminEditValue.trim() : (adminSelectedUser.firstName || "");
      const newLast = field === "lastName" ? adminEditValue.trim() : (adminSelectedUser.lastName || "");
      await updateDoc(userRef, { fullName: `${newFirst} ${newLast}`.trim() });
    }
    setAdminUsers((prev) => prev.map((u) => {
      if (u.uid !== adminSelectedUser.uid) return u;
      const updated = { ...u, ...updateData };
      if (field === "firstName" || field === "lastName") {
        updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
      }
      return updated;
    }));
    setAdminSelectedUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updateData };
      if (field === "firstName" || field === "lastName") {
        updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
      }
      return updated;
    });
    logAdminActivity("Modification profil", `Champ "${field}" modifié pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
    setAdminEditingField(null);
    setAdminEditValue("");
  } catch (err) {
    /* profile edit failed silently */
  }
};

// ── Bulk selection ──
const toggleUserSelect = (uid: string) => {
  const next = new Set(adminSelectedUserIds);
  if (next.has(uid)) next.delete(uid); else next.add(uid);
  setAdminSelectedUserIds(next);
};

const selectAllUsers = () => {
  if (adminSelectedUserIds.size === pagedAdminUsers.length) {
    setAdminSelectedUserIds(new Set());
  } else {
    setAdminSelectedUserIds(new Set(pagedAdminUsers.map((u) => u.uid)));
  }
};

const handleBulkSuspend = async () => {
  if (adminSelectedUserIds.size === 0) return;
  const uidsToSuspend = Array.from(adminSelectedUserIds);
  const successfulUids: string[] = [];
  try {
    // Phase 1: Suspendre tous les utilisateurs un par un (ne pas utiliser Promise.all)
    for (const uid of uidsToSuspend) {
      try {
        await updateDoc(doc(firebaseDb, "moraliUsers", uid), { accountStatus: "suspended" as const });
        successfulUids.push(uid);
      } catch {
        console.error(`[bulk-suspend] Échec pour UID: ${uid}`);
      }
    }

    if (successfulUids.length === 0) {
      showToast("Aucun utilisateur n'a pu être suspendu");
      return;
    }

    // Phase 2: Mettre à jour le state local uniquement pour les succès
    setAdminUsers((prev) => prev.map((u) => successfulUids.includes(u.uid) ? { ...u, accountStatus: "suspended" as const } : u));
    logAdminActivity("Suspension en masse", `${successfulUids.length}/${uidsToSuspend.length} utilisateurs suspendus`);

    // Phase 3: Notifier chaque utilisateur suspendu (en parallèle, non bloquant)
    Promise.allSettled(
      successfulUids.map((uid) =>
        createRealtimeNotification(uid, {
          title: "Votre compte a été suspendu",
          time: new Date().toLocaleString("fr-FR"),
          badge: "Alerte",
          badgeClass: "nb-red",
          icon: "shield",
          bg: "rgba(239,68,68,0.12)",
          read: false,
        })
      )
    );

    // Feedback à l'admin
    if (successfulUids.length < uidsToSuspend.length) {
      showToast(`${successfulUids.length}/${uidsToSuspend.length} utilisateurs suspendus — certains ont échoué`);
    } else {
      showToast(`${successfulUids.length} utilisateurs suspendus avec succès`);
    }

    setAdminSelectedUserIds(new Set());
  } catch (err) {
    console.error("Erreur suspension en masse:", err);
    showToast("Erreur lors de la suspension en masse");
  }
};

const handleBulkExport = () => {
  const selected = filteredAdminUsers.filter((u) => adminSelectedUserIds.has(u.uid));
  const headers = ["Nom", "Email", "Pseudo", "ID Morali", "Solde", "Statut"];
  const rows = selected.map((u) => [u.fullName || "", u.email || "", u.pseudo || "", u.moraliId || "", String(u.balance || 0), u.accountStatus === "suspended" ? "Suspendu" : "Actif"]);
  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "morali_export_selection.csv"; a.click();
  URL.revokeObjectURL(url);
  logAdminActivity("Export sélection", `${selected.length} utilisateurs exportés`);
};

const handleBulkNotify = async () => {
  try {
    await Promise.all(
      Array.from(adminSelectedUserIds).map((uid) =>
        createRealtimeNotification(uid, {
          title: "Notification administrative",
          time: new Date().toLocaleString("fr-FR"),
          badge: "Admin", badgeClass: "nb-blue", icon: "bell", bg: "rgba(59,130,246,0.12)", read: false,
        })
      )
    );
    logAdminActivity("Notification en masse", `Notification envoyée à ${adminSelectedUserIds.size} utilisateurs`);
    setAdminSelectedUserIds(new Set());
  } catch (err) {
    /* bulk notify failed silently */
  }
};

// ── Pagination ──
const adminUsersTotalPages = Math.ceil(filteredAdminUsers.length / adminUsersPerPage) || 1;
const pagedAdminUsers = filteredAdminUsers.slice((adminUsersPage - 1) * adminUsersPerPage, adminUsersPage * adminUsersPerPage);

// Reset page on filter change
useEffect(() => { setAdminUsersPage(1); }, [adminSearchQuery]);
useEffect(() => { setAdminTxPage(1); }, [adminTxFilter, adminTxDateFrom, adminTxDateTo, adminTxAmountMin, adminTxAmountMax]);

// ── Transaction search for transactions tab ──
const txSearchFilteredAdminTransactions = useMemo(() => {
  if (adminTab !== "transactions" || !adminSearchQuery.trim()) return filteredAdminTransactions;
  const q = adminSearchQuery.toLowerCase();
  return filteredAdminTransactions.filter(
    (t) =>
      (t.senderName || "").toLowerCase().includes(q) ||
      (t.recipientName || "").toLowerCase().includes(q) ||
      (t.receiptId || "").toLowerCase().includes(q) ||
      (t.senderMoraliId || "").toLowerCase().includes(q) ||
      (t.recipientMoraliId || "").toLowerCase().includes(q)
  );
}, [filteredAdminTransactions, adminSearchQuery, adminTab]);

const pagedTxSearchTransactions = useMemo(() => {
  const txTotalPages = Math.ceil(txSearchFilteredAdminTransactions.length / adminTxPerPage) || 1;
  return txSearchFilteredAdminTransactions.slice((adminTxPage - 1) * adminTxPerPage, adminTxPage * adminTxPerPage);
}, [txSearchFilteredAdminTransactions, adminTxPage, adminTxPerPage]);

const txSearchTotalPages = Math.ceil(txSearchFilteredAdminTransactions.length / adminTxPerPage) || 1;

// ── Contest/flag transaction ──
const handleAdminContestTx = async (tx: FirestoreTransfer) => {
  try {
    // Find the tx document - we need its ID from the transactions collection
    const txId = (tx as FirestoreTransfer & { id?: string }).id;
    if (txId) {
      await updateDoc(doc(firebaseDb, "transactions", txId), { status: "contested" });
    }
    setAdminTransactions((prev) => prev.map((t) => (t as FirestoreTransfer & { id?: string }).id === txId ? { ...t, status: "contested" as const } : t));
    setAdminSelectedTx((prev) => prev && (prev as FirestoreTransfer & { id?: string }).id === txId ? { ...prev, status: "contested" as const } : prev);
    logAdminActivity("Transaction contestée", `${tx.receiptId} — ${formatCurrency(tx.amount)} XAF`);
  } catch (err) {
    /* contest tx failed silently */
  }
};

// ── Financial Reports ──
const adminFinancialReport = useMemo(() => {
  const now = new Date();
  let startDate: Date;
  let rangeLabel: string;

  if (adminReportMode === "daily") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    rangeLabel = `Aujourd'hui — ${now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
  } else if (adminReportMode === "weekly") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    rangeLabel = `${startDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })} — ${endDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    rangeLabel = `${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
  }

  const startMs = startDate.getTime();
  const inRange = adminTransactions.filter((t) => {
    if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
    return (t.createdAt as { seconds: number }).seconds * 1000 >= startMs;
  });

  const totalDepots = inRange.filter((t) => t.type === "depot").reduce((s, t) => s + t.amount, 0);
  const totalRetraits = inRange.filter((t) => t.type === "retrait").reduce((s, t) => s + t.amount, 0);
  const totalVirements = inRange.filter((t) => t.type === "virement").reduce((s, t) => s + t.amount, 0);
  const net = totalDepots - totalRetraits - totalVirements;

  return { rangeLabel, totalDepots, totalRetraits, totalVirements, net, transactions: inRange };
}, [adminTransactions, adminReportMode]);

// ── Fee calculation example ──
const adminFeeExample = useMemo(() => {
  const exampleAmount = 500000;
  if (adminFeeMode === "fixed") {
    return `Ex: ${formatCurrency(exampleAmount)} XAF + ${formatCurrency(parseFloat(transferFee) || 0)} XAF = ${formatCurrency(exampleAmount + (parseFloat(transferFee) || 0))} XAF`;
  } else {
    const feePct = parseFloat(transferFee) || 0;
    const feeAmount = Math.round((exampleAmount * feePct) / 100);
    return `Ex: ${formatCurrency(exampleAmount)} XAF × ${feePct}% = ${formatCurrency(feeAmount)} XAF`;
  }
}, [adminFeeMode, transferFee]);

// ── Per-user limits ──
const handleAdminSaveUserLimits = async () => {
  if (!adminSelectedUser) return;
  try {
    const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
    await updateDoc(userRef, {
      dailyLimit: parseFloat(adminUserLimits.dailyLimit) || 0,
      txLimit: parseFloat(adminUserLimits.txLimit) || 0,
    });
    logAdminActivity("Limites modifiées", `Limites personnalisées mises à jour pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
    setAdminLimitEditOpen(false);
  } catch (err) {
    /* save limits failed silently */
  }
};

// ── Admin roles ──
const [adminAdminUsers, setAdminAdminUsers] = useState<FirestoreMoraliUser[]>([]);

useEffect(() => {
  if (isAdminLoggedIn) {
    getDocs(collection(firebaseDb, "moraliUsers")).then((snap) => {
      const admins = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as FirestoreMoraliUser))
        .filter((u) => (u as Record<string, unknown>).role === "admin");
      setAdminAdminUsers(admins);
    }).catch((err: unknown) => { console.error("Erreur chargement admins:", err); });
  }
}, [isAdminLoggedIn]);

const handleAdminChangeRole = async (uid: string, newRole: string) => {
  try {
    await updateDoc(doc(firebaseDb, "moraliUsers", uid), { adminRole: newRole });
    setAdminAdminUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, adminRole: newRole } as FirestoreMoraliUser & { adminRole?: string } : u));
    logAdminActivity("Rôle modifié", `Rôle changé en "${newRole}" pour l'admin ${uid}`);
  } catch (err) {
    /* change role failed silently */
  }
};

// ── Backup/Restore ──
const handleAdminBackup = async () => {
  setAdminBackupLoading(true);
  try {
    const [usersSnap, txSnap] = await Promise.all([
      getDocs(collection(firebaseDb, "moraliUsers")),
      getDocs(collection(firebaseDb, "transactions")),
    ]);
    const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const backup = JSON.stringify({ users, transactions, exportedAt: new Date().toISOString(), version: 1 }, null, 2);
    const blob = new Blob([backup], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `morali_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAdminActivity("Sauvegarde exportée", `${users.length} utilisateurs, ${transactions.length} transactions`);
  } catch (err) {
    /* backup failed silently */
  } finally {
    setAdminBackupLoading(false);
  }
};

const handleAdminRestore = async (file: File) => {
  setAdminBackupLoading(true);
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.users || !data.transactions) throw new Error("Format de fichier invalide");
    let userCount = 0;
    let txCount = 0;
    // Sanitize user data before writing to Firestore
    const sanitizeForFirestore = (obj: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(obj).filter(([, v]) => {
          if (v === undefined) return false;
          if (typeof v === "number" && !Number.isFinite(v)) return false;
          return true;
        })
      );
    await Promise.all(
      data.users.map((u: Record<string, unknown>) => {
        userCount++;
        return setDoc(doc(firebaseDb, "moraliUsers", String(u.uid)), sanitizeForFirestore(u));
      })
    );
    await Promise.all(
      data.transactions.map((t: Record<string, unknown>) => {
        txCount++;
        return setDoc(doc(firebaseDb, "transactions", String(t.id)), sanitizeForFirestore(t));
      })
    );
    logAdminActivity("Données restaurées", `${userCount} utilisateurs, ${txCount} transactions importés`);
    await fetchAdminData();
  } catch (err) {
    /* restore failed silently */
    logAdminActivity("Erreur restauration", `Échec de la restauration: ${(err as Error).message}`);
  } finally {
    setAdminBackupLoading(false);
  }
};

// ── Admin Loan Management ──
const handleAdminApproveLoan = async (loan: { id: string; senderUid: string; senderName: string; senderMoraliId: string; amount: number; type?: string }) => {
  try {
    const userRef = doc(firebaseDb, "moraliUsers", loan.senderUid);
    const loanTxRef = doc(firebaseDb, "transactions", loan.id);

    // Atomically credit user balance and update loan status
    await runTransaction(firebaseDb, async (tx) => {
      const userDoc = await tx.get(userRef);
      if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
      const currentBal = userDoc.data().balance || 0;
      tx.update(userRef, { balance: currentBal + loan.amount, updatedAt: serverTimestamp() });
      tx.update(loanTxRef, { status: "success", destination: "loan_granted", updatedAt: serverTimestamp() });
    });

    // Create disbursement transaction record
    await createRealtimeTransaction({
      senderUid: "admin", senderMoraliId: "MORALI-ADMIN", senderName: "Morali Pay",
      recipientUid: loan.senderUid, recipientMoraliId: loan.senderMoraliId, recipientName: loan.senderName,
      amount: loan.amount, fees: 0,
      type: "depot", destination: "loan_granted", status: "success",
      receiptId: "LN-APPROVED-" + Date.now().toString().slice(-8),
    });

    // Notify user
    await createRealtimeNotification(loan.senderUid, {
      title: `Prêt approuvé — ${formatCurrency(loan.amount)} FCFA`,
      time: "À l'instant", badge: "Approuvé", badgeClass: "nb-green",
      icon: "bank", bg: "rgba(34,197,94,0.12)", read: false,
    });

    logAdminActivity("Prêt approuvé", `${loan.senderName} — ${formatCurrency(loan.amount)} FCFA`);
    showToast(`Prêt approuvé pour ${loan.senderName}`);
    setAdminLoans((prev) => prev.filter((l) => l.id !== loan.id));
  } catch (err) {
    /* approve loan failed silently */
    showToast("Erreur lors de l'approbation");
  }
};

const handleAdminRejectLoan = async (loan: { id: string; senderUid: string; senderName: string; amount: number; type?: string }) => {
  try {
    const loanTxRef = doc(firebaseDb, "transactions", loan.id);
    await updateDoc(loanTxRef, { status: "contested", updatedAt: serverTimestamp() });

    // Notify user
    await createRealtimeNotification(loan.senderUid, {
      title: `Prêt refusé — ${formatCurrency(loan.amount)} FCFA`,
      time: "À l'instant", badge: "Refusé", badgeClass: "nb-red",
      icon: "bank", bg: "rgba(239,68,68,0.12)", read: false,
    });

    logAdminActivity("Prêt refusé", `${loan.senderName} — ${formatCurrency(loan.amount)} FCFA`);
    showToast(`Prêt refusé pour ${loan.senderName}`);
    setAdminLoans((prev) => prev.filter((l) => l.id !== loan.id));
  } catch (err) {
    /* reject loan failed silently */
    showToast("Erreur lors du refus");
  }
};


  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    isAdminLoggedIn,
    handleAdminLongPressStart,
    handleAdminLongPressEnd,
    handleAdminLogout,
  }), [isAdminLoggedIn]);

  // ── Admin Render ──
  if (screen !== "admin") return null;

  return (
    <>
{/* ── ADMIN SCREENS ── */}
{screen === "admin" && !isAdminLoggedIn && adminForgotStep === "idle" && (
  <div className="admin-login-screen">
    <button className="admin-login-back" onClick={() => { setScreen("auth"); setAdminForgotStep("idle"); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(26,62,120,0.3)", border: "1px solid rgba(212,164,55,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 32px rgba(59,130,246,0.3)" }}>
      <MoraliShield />
    </div>
    <div className="admin-login-card">
      <div className="admin-login-title">Administration</div>
      <div className="admin-login-sub">
        Accès réservé aux administrateurs Morali Pay.
      </div>



      {/* ── LOGIN ── */}
        <>
          <div className="admin-login-field">
            <label className="admin-login-label">Email administrateur</label>
            <input
              type="email"
              className="admin-login-input"
              placeholder="admin@morali.bank"
              value={adminLoginEmailFetched && adminExists ? adminLoginEmail : adminLoginEmail}
              onChange={(e) => setAdminLoginEmail(e.target.value)}
              readOnly={adminExists && adminLoginEmailFetched}
              style={{
                opacity: adminExists && adminLoginEmailFetched ? 0.7 : 1,
                cursor: adminExists && adminLoginEmailFetched ? "default" : "text",
              }}
              autoComplete="email"
            />
          </div>
          <div className="admin-login-field">
            <label className="admin-login-label">Mot de passe</label>
            <input
              type="password"
              className="admin-login-input"
              placeholder="••••••••"
              value={adminLoginPassword}
              onChange={(e) => setAdminLoginPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }}
            />
          </div>
          <button className="admin-login-btn" onClick={handleAdminLogin} disabled={adminLoginLoading || !adminLoginEmail || !adminLoginPassword}>
            {adminLoginLoading ? <div className="btn-loader" /> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 1 1 10 0v4"/></svg> Connexion Admin</>}
          </button>
          <div className="admin-login-error">{adminLoginError || "\u00A0"}</div>
          <div onClick={() => setAdminForgotStep("email")} style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#64748b", cursor: "pointer" }}>
            Mot de passe oublié ?
          </div>
        </>
    </div>
  </div>
)}

{/* ── ADMIN FORGOT PASSWORD ── */}
{screen === "admin" && !isAdminLoggedIn && adminForgotStep !== "idle" && (
  <div className="admin-login-screen">
    <button className="admin-login-back" onClick={() => setAdminForgotStep("idle")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(26,62,120,0.3)", border: "1px solid rgba(212,164,55,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 32px rgba(59,130,246,0.3)" }}>
      <MoraliShield />
    </div>
    <div className="admin-login-card">
      <div className="admin-login-title">
        {adminForgotStep === "email" && "Mot de passe oublié"}
        {adminForgotStep === "code" && "Vérification du code"}
        {adminForgotStep === "newPassword" && "Nouveau mot de passe"}
        {adminForgotStep === "success" && "Succès"}
      </div>
      <div className="admin-login-sub">
        {adminForgotStep === "email" && "Entrez l'email admin pour recevoir un code de vérification."}
        {adminForgotStep === "code" && "Saisissez le code envoyé à votre email."}
        {adminForgotStep === "newPassword" && "Choisissez votre nouveau mot de passe."}
        {adminForgotStep === "success" && "Votre mot de passe a été modifié avec succès."}
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 22 }}>
        {(["email", "code", "newPassword"] as const).map((step, i) => (
          <React.Fragment key={step}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
                background: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                  ? "rgba(212,164,55,.15)" : "rgba(255,255,255,.04)",
                border: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                  ? "1px solid rgba(212,164,55,.3)" : "1px solid rgba(255,255,255,.08)",
                color: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                  ? "#d4a437" : "#475569",
              }}>
                {adminForgotStep === "success" || (step !== "newPassword" && adminForgotStep === "newPassword") || (step === "email" && adminForgotStep !== "email") ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{["Email", "Code", "Mot de passe"][i]}</span>
            </div>
            {i < 2 && (
              <div style={{ width: 32, height: 2, margin: "0 4px", marginBottom: 16, borderRadius: 1,
                background: (step === "email" && adminForgotStep !== "email") || (step === "code" && adminForgotStep === "newPassword") || adminForgotStep === "success"
                  ? "#d4a437" : "rgba(255,255,255,.08)" }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {adminForgotStep === "email" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="admin-login-field">
            <label className="admin-login-label">Email administrateur</label>
            <input type="email" className="admin-login-input" placeholder="admin@morali.bank" value={adminForgotEmail} onChange={(e) => setAdminForgotEmail(e.target.value)} autoFocus />
          </div>
          <button className="admin-login-btn" onClick={adminForgotSendCode} disabled={adminForgotSending || !adminForgotEmail.trim() || !adminForgotEmail.includes("@")} style={adminForgotSending || !adminForgotEmail.trim() ? { opacity: 0.4 } : {}}>
            {adminForgotSending ? <div className="btn-loader" /> : "Envoyer le code"}
          </button>
        </div>
      )}

      {adminForgotStep === "code" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="admin-login-field">
            <label className="admin-login-label">Code de vérification</label>
            <input type="text" className="admin-login-input" inputMode="numeric" maxLength={6} placeholder="000000" value={adminForgotOtpCode} onChange={(e) => setAdminForgotOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ textAlign: "center", fontSize: 20, letterSpacing: ".3em", fontWeight: 900 }} autoFocus />
          </div>
          <button className="admin-login-btn" onClick={adminForgotVerifyCode} disabled={adminForgotOtpCode.length !== 6 || adminForgotVerifying} style={adminForgotOtpCode.length !== 6 ? { opacity: 0.4 } : {}}>
            {adminForgotVerifying ? <div className="btn-loader" /> : "Vérifier le code"}
          </button>
          <div onClick={adminForgotSendCode} style={{ textAlign: "center", fontSize: 11, color: "#64748b", cursor: "pointer" }}>
            Renvoyer le code
          </div>
        </div>
      )}

      {adminForgotStep === "newPassword" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="admin-login-field">
            <label className="admin-login-label">Nouveau mot de passe</label>
            <input type="password" className="admin-login-input" placeholder="Minimum 8 caractères" value={adminForgotNewPw} onChange={(e) => setAdminForgotNewPw(e.target.value)} autoFocus />
          </div>
          <div className="admin-login-field">
            <label className="admin-login-label">Confirmer le mot de passe</label>
            <input type="password" className="admin-login-input" placeholder="Confirmez" value={adminForgotConfirmPw} onChange={(e) => setAdminForgotConfirmPw(e.target.value)} />
          </div>
          <button className="admin-login-btn" onClick={adminForgotResetPassword} disabled={adminForgotNewPw.length < 8 || adminForgotNewPw !== adminForgotConfirmPw || adminForgotResetting} style={adminForgotNewPw.length < 8 || adminForgotNewPw !== adminForgotConfirmPw ? { opacity: 0.4 } : {}}>
            {adminForgotResetting ? <div className="btn-loader" /> : "Réinitialiser le mot de passe"}
          </button>
        </div>
      )}

      {adminForgotStep === "success" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "2px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, lineHeight: 1.6 }}>
            Mot de passe modifié avec succès.<br />Vous pouvez maintenant vous connecter.
          </div>
          <button className="admin-login-btn" onClick={() => { setAdminForgotStep("idle"); setAdminLoginPassword(""); setAdminForgotOtpCode(""); setAdminForgotNewPw(""); setAdminForgotConfirmPw(""); }} style={{ marginTop: 4 }}>
            Retour à la connexion
          </button>
        </div>
      )}
    </div>
  </div>
)}

{screen === "admin" && isAdminLoggedIn && (
  <div className="admin-fullscreen">
    <div className="admin-mobile-backdrop" style={{ display: adminSidebarOpen ? "block" : "none" }} onClick={() => setAdminSidebarOpen(false)} />
    <div className={`admin-layout`}>
      <aside className={`admin-sidebar ${adminSidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-logo">MB</div>
        <nav className="admin-sidebar-nav">
          {([
            { tab: "overview" as AdminTab, label: "Dashboard", icon: <><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/><path d="M10 19v-4h4v4"/></> },
            { tab: "users" as AdminTab, label: "Utilisateurs", icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="3"/><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/></> },
            { tab: "transactions" as AdminTab, label: "Transactions", icon: <><path d="M7 7h11"/><path d="m14 4 4 3-4 3"/><path d="M17 17H6"/><path d="m10 14-4 3 4 3"/></> },
            { tab: "analytics" as AdminTab, label: "Analytique", icon: <><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></> },
            { tab: "loans" as AdminTab, label: "Prêts", icon: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
            { tab: "audit" as AdminTab, label: "Journal d'audit", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></> },
            { tab: "settings" as AdminTab, label: "Paramètres", icon: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M4.93 4.93l2.12 2.12"/><path d="M16.95 16.95l2.12 2.12"/><path d="M3 12h4"/><path d="M17 12h4"/></> },
          ]).map((item) => (
            <button key={item.tab} className={`admin-sidebar-item ${adminTab === item.tab ? "active" : ""}`} onClick={() => { setAdminTab(item.tab); setAdminSidebarOpen(false); }}>
              <svg viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
              <span className="admin-sidebar-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-sidebar-item logout-btn" onClick={() => setLogoutModalOpen(true)}>
            <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="admin-sidebar-label">Déconnexion</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-mobile-toggle" onClick={() => setAdminSidebarOpen(!adminSidebarOpen)}>
              <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <div className="admin-header-title">
                {adminTab === "overview" && "Tableau de bord"}
                {adminTab === "users" && "Utilisateurs"}
                {adminTab === "transactions" && "Transactions"}
                {adminTab === "analytics" && "Analytique"}
                {adminTab === "loans" && "Demandes de Prêts"}
                {adminTab === "audit" && "Journal d'audit"}
                {adminTab === "settings" && "Paramètres"}
              </div>
            </div>
            <span className="admin-header-badge" style={adminPermissionLevel === "viewer" ? { background: "rgba(100,116,139,.2)", color: "#94a3b8" } : {}}>
              {adminPermissionLevel === "full" ? "Super Admin" : "Lecture seule"}
            </span>
          </div>
          <div className="admin-header-right">
            <input className="admin-header-search" placeholder="Rechercher..." value={adminSearchQuery} onChange={(e) => setAdminSearchQuery(e.target.value)} />
            <div className="admin-header-avatar">AD</div>
            <div className="admin-refresh-indicator">
              <div className="admin-refresh-dot" />
              <span>il y a {adminRefreshSeconds}s</span>
            </div>
          </div>
        </header>

        <div className="admin-content">
          {adminLoading ? (
            <div className="admin-empty">
              <div className="btn-loader" style={{ width: 32, height: 32, margin: "0 auto 16px" }} />
              <div className="admin-empty-text">Chargement des données...</div>
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {adminTab === "overview" && (
                <>
                  <div className="admin-stats">
                    <div className="admin-stat-card blue">
                      <div className="admin-stat-top">
                        <span className="admin-stat-label">Total Utilisateurs</span>
                        <span className="admin-stat-trend up">Actifs</span>
                      </div>
                      <div className="admin-stat-value">{formatCurrency(adminUsers.length)}</div>
                      <div className="admin-stat-icon blue">
                        <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="3"/><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/></svg>
                      </div>
                    </div>
                    <div className="admin-stat-card green">
                      <div className="admin-stat-top">
                        <span className="admin-stat-label">Solde Total Banque</span>
                        <span className="admin-stat-trend up">XAF</span>
                      </div>
                      <div className="admin-stat-value" style={{ fontSize: adminTotalBalance > 9999999 ? 18 : 24 }}>{formatCurrency(adminTotalBalance)}</div>
                      <div className="admin-stat-icon green">
                        <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z"/><path d="M16 12h4"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/></svg>
                      </div>
                    </div>
                    <div className="admin-stat-card amber">
                      <div className="admin-stat-top">
                        <span className="admin-stat-label">Transactions Aujourd'hui</span>
                        <span className="admin-stat-trend up">Live</span>
                      </div>
                      <div className="admin-stat-value">{formatCurrency(adminTodayTransactions)}</div>
                      <div className="admin-stat-icon amber">
                        <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M7 7h11"/><path d="m14 4 4 3-4 3"/><path d="M17 17H6"/><path d="m10 14-4 3 4 3"/></svg>
                      </div>
                    </div>
                    <div className="admin-stat-card purple">
                      <div className="admin-stat-top">
                        <span className="admin-stat-label">Volume Total</span>
                        <span className="admin-stat-trend up">XAF</span>
                      </div>
                      <div className="admin-stat-value" style={{ fontSize: adminTotalTransactions > 9999999 ? 18 : 24 }}>{formatCurrency(adminTotalTransactions)}</div>
                      <div className="admin-stat-icon purple">
                        <svg viewBox="0 0 24 24" stroke="currentColor"><ellipse cx="12" cy="7" rx="5" ry="2.5"/><path d="M7 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M9 14.5v2c0 1.1 1.8 2 4 2s4-.9 4-2v-2"/></svg>
                      </div>
                    </div>
                  </div>

                  {/* ── Revenus Bancaires ── */}
                  {bankRevenue && (
                    <div className="admin-section">
                      <div className="admin-section-header">
                        <div className="admin-section-title">Revenus Bancaires</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Aujourd'hui</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>{formatCurrency(bankRevenue.todayTotal)} F</span>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginLeft: 8 }}>Total</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa" }}>{formatCurrency(bankRevenue.allTimeTotal)} F</span>
                        </div>
                      </div>

                      {/* Period selector */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                        {([
                          { key: "today", label: "Aujourd'hui" },
                          { key: "week", label: "7 jours" },
                          { key: "month", label: "Ce mois" },
                          { key: "year", label: "Cette année" },
                        ] as const).map((p) => (
                          <button
                            key={p.key}
                            onClick={() => setRevenuePeriod(p.key)}
                            style={{
                              padding: "5px 12px",
                              borderRadius: 8,
                              border: revenuePeriod === p.key ? "1px solid #D4A437" : "1px solid rgba(255,255,255,.1)",
                              background: revenuePeriod === p.key ? "rgba(212,164,55,.12)" : "rgba(255,255,255,.04)",
                              color: revenuePeriod === p.key ? "#D4A437" : "#94a3b8",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              transition: "all .2s",
                            }}
                          >
                            {p.label}
                          </button>
                        ))}
                        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: "#D4A437" }}>
                          Période: {formatCurrency(bankRevenue.total)} F
                        </span>
                      </div>

                      {/* Fee structure summary */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6, marginBottom: 16, padding: "10px 12px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
                        {[
                          { label: "Retrait", rate: "2%" },
                          { label: "Services", rate: "2%" },
                          { label: "Transfert", rate: "Gratuit" },
                          { label: "Change", rate: "1.5%" },
                          { label: "Entretien", rate: "1 000 F/mois" },
                          { label: "Tontine", rate: "1%" },
                          { label: "Micro-crédit", rate: "3%/mois" },
                          { label: "Carte Black", rate: "15 000 F/an" },
                        ].map((f) => (
                          <div key={f.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>{f.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: f.rate === "Gratuit" ? "#22c55e" : "#D4A437" }}>{f.rate}</span>
                          </div>
                        ))}
                      </div>

                      {/* Revenue breakdown cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
                        {bankRevenue.breakdown.map((item) => (
                          <div key={item.type} style={{
                            background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 12px",
                            border: "1px solid rgba(255,255,255,.08)",
                          }}>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: item.amount > 0 ? "#22c55e" : "#64748b" }}>
                              {formatCurrency(item.amount)} F
                            </div>
                            {item.percentage > 0 && (
                              <div style={{
                                fontSize: 9, fontWeight: 700, color: "#D4A437",
                                background: "rgba(212,164,55,.12)", borderRadius: 6,
                                display: "inline-block", padding: "2px 6px", marginTop: 4,
                              }}>
                                {item.percentage}%
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {bankRevenue.recent.length > 0 && (
                        <div className="admin-table-wrap">
                          <div className="admin-table-scroll">
                            <table className="admin-table">
                              <thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Utilisateur</th><th>Description</th></tr></thead>
                              <tbody>
                                {bankRevenue.recent.slice(0, 12).map((entry) => (
                                  <tr key={entry.id}>
                                    <td style={{ color: "#94a3b8", fontSize: 12 }}>{entry.createdAt}</td>
                                    <td><span className="admin-badge" style={{ background: "rgba(34,197,94,.15)", color: "#22c55e" }}>{entry.type}</span></td>
                                    <td style={{ color: "#22c55e", fontWeight: 700 }}>+{formatCurrency(entry.amount)} F</td>
                                    <td style={{ color: "#fff", fontWeight: 600 }}>{entry.sourceName}</td>
                                    <td style={{ color: "#94a3b8", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="admin-section">
                    <div className="admin-section-header">
                      <div className="admin-section-title">Transactions récentes</div>
                    </div>
                    <div className="admin-table-wrap">
                      {adminTransactions.length === 0 ? (
                        <div className="admin-empty"><div className="admin-empty-icon">📋</div><div className="admin-empty-text">Aucune transaction trouvée.</div></div>
                      ) : (
                        <div className="admin-table-scroll">
                          <table className="admin-table">
                            <thead><tr><th>Date</th><th>De</th><th>À</th><th>Montant</th><th>Type</th></tr></thead>
                            <tbody>
                              {adminTransactions.slice(0, 10).map((tx, i) => {
                                const txType = getAdminTxTypeLabel(tx.type);
                                return (
                                  <tr key={i}>
                                    <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(tx.createdAt)}</td>
                                    <td style={{ color: "#fff", fontWeight: 600 }}>{tx.senderName || tx.senderMoraliId || "—"}</td>
                                    <td style={{ color: "#fff", fontWeight: 600 }}>{tx.recipientName || tx.recipientMoraliId || "—"}</td>
                                    <td className={tx.type === "depot" ? "admin-amount-pos" : "admin-amount-neg"}>
                                      {tx.type === "depot" ? "+" : "-"} {formatCurrency(tx.amount)} XAF
                                    </td>
                                    <td><span className={`admin-badge ${txType.cls}`}>{txType.label}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="admin-section">
                    <div className="admin-section-header">
                      <div className="admin-section-title">Derniers utilisateurs inscrits</div>
                    </div>
                    <div className="admin-table-wrap">
                      {adminUsers.length === 0 ? (
                        <div className="admin-empty"><div className="admin-empty-icon">👥</div><div className="admin-empty-text">Aucun utilisateur enregistré.</div></div>
                      ) : (
                        <div className="admin-table-scroll">
                          <table className="admin-table">
                            <thead><tr><th>Utilisateur</th><th>ID Morali</th><th>Solde</th><th>Date</th></tr></thead>
                            <tbody>
                              {[...adminUsers].reverse().slice(0, 8).map((u) => (
                                <tr key={u.uid} style={{ cursor: "pointer" }} onClick={() => setAdminSelectedUser(u)}>
                                  <td>
                                    <div className="admin-user-cell">
                                      <div className="admin-user-avatar">{getAdminUserInitials(u)}</div>
                                      <div><div className="admin-user-name">{u.fullName || u.pseudo || "—"}</div><div className="admin-user-email">{u.email || "—"}</div></div>
                                    </div>
                                  </td>
                                  <td style={{ color: "#60a5fa", fontWeight: 600 }}>{u.moraliId || "—"}</td>
                                  <td style={{ fontWeight: 700 }}>{formatCurrency(u.balance || 0)} XAF</td>
                                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(u.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* USERS TAB */}
              {adminTab === "users" && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div className="admin-section-title">Tous les utilisateurs ({filteredAdminUsers.length})</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button className="admin-select-all-btn" onClick={selectAllUsers}>
                        {adminSelectedUserIds.size === pagedAdminUsers.length && pagedAdminUsers.length > 0 ? "Tout désélectionner" : "Tout sélectionner"}
                      </button>
                      <button className="admin-export-btn" onClick={generateUsersCSV}>
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Exporter CSV
                      </button>
                    </div>
                  </div>
                  {adminSelectedUserIds.size > 0 && (
                    <div className="admin-bulk-bar">
                      <span className="admin-bulk-count">{adminSelectedUserIds.size} sélectionné(s)</span>
                      {adminPermissionLevel === "full" && <button className="admin-bulk-btn danger" onClick={handleBulkSuspend}>Suspendre la sélection</button>}
                      <button className="admin-bulk-btn" onClick={handleBulkExport}>Exporter sélection</button>
                      {adminPermissionLevel === "full" && <button className="admin-bulk-btn" onClick={handleBulkNotify}>Envoyer notification</button>}
                    </div>
                  )}
                  <div className="admin-table-wrap">
                    {filteredAdminUsers.length === 0 ? (
                      <div className="admin-empty"><div className="admin-empty-icon">👥</div><div className="admin-empty-text">{adminSearchQuery ? "Aucun résultat pour cette recherche." : "Aucun utilisateur enregistré."}</div></div>
                    ) : (
                      <div className="admin-table-scroll">
                        <table className="admin-table">
                          <thead><tr><th style={{ width: 36 }}></th><th>Utilisateur</th><th>Email</th><th>ID Morali</th><th>Solde</th><th>Statut</th><th>Inscription</th></tr></thead>
                          <tbody>
                            {pagedAdminUsers.map((u) => (
                              <tr key={u.uid} style={{ cursor: "pointer" }} onClick={() => { setAdminSelectedUser(u); setAdminBalanceEditMode(null); setAdminBalanceEditAmount(""); setAdminNotifForm({ title: "", message: "", open: false }); setAdminEditingField(null); setAdminLimitEditOpen(false); }}>
                                <td onClick={(e) => e.stopPropagation()}>
                                  <div className={`admin-user-checkbox ${adminSelectedUserIds.has(u.uid) ? "checked" : ""}`} onClick={(e) => { e.stopPropagation(); toggleUserSelect(u.uid); }} />
                                </td>
                                <td>
                                  <div className="admin-user-cell">
                                    <div className="admin-user-avatar">{getAdminUserInitials(u)}</div>
                                    <div className="admin-user-name">{u.fullName || u.pseudo || "—"}</div>
                                  </div>
                                </td>
                                <td style={{ color: "#94a3b8", fontSize: 12 }}>{u.email || "—"}</td>
                                <td style={{ color: "#60a5fa", fontWeight: 600, fontSize: 12 }}>{u.moraliId || "—"}</td>
                                <td style={{ fontWeight: 700 }}>{formatCurrency(u.balance || 0)} XAF</td>
                                <td><span className={`admin-badge ${u.accountStatus === "suspended" ? "danger" : (u.balance || 0) > 0 ? "success" : "warning"}`}>{u.accountStatus === "suspended" ? "Suspendu" : (u.balance || 0) > 0 ? "Actif" : "Nouveau"}</span></td>
                                <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(u.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {filteredAdminUsers.length > adminUsersPerPage && (
                    <div className="admin-pagination">
                      <button disabled={adminUsersPage <= 1} onClick={() => setAdminUsersPage(adminUsersPage - 1)}>←</button>
                      <span className="admin-page-info">Affichage {(adminUsersPage - 1) * adminUsersPerPage + 1}-{Math.min(adminUsersPage * adminUsersPerPage, filteredAdminUsers.length)} sur {filteredAdminUsers.length} utilisateurs</span>
                      <button disabled={adminUsersPage >= adminUsersTotalPages} onClick={() => setAdminUsersPage(adminUsersPage + 1)}>→</button>
                    </div>
                  )}
                </div>
              )}

              {/* TRANSACTIONS TAB */}
              {adminTab === "transactions" && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div className="admin-section-title">Historique des transactions ({txSearchFilteredAdminTransactions.length})</div>
                    <div className="admin-section-actions">
                      {(["all", "virement", "depot", "retrait", "remboursement"] as const).map((f) => (
                        <button key={f} className={`admin-filter-btn ${adminTxFilter === f ? "active" : ""}`} onClick={() => setAdminTxFilter(f)}>
                          {f === "all" ? "Tout" : f === "virement" ? "Virements" : f === "depot" ? "Dépôts" : f === "retrait" ? "Retraits" : "Remboursements"}
                        </button>
                      ))}
                      <button className={`admin-filter-btn contested ${adminTxFilter === "contested" ? "active" : ""}`} onClick={() => setAdminTxFilter(adminTxFilter === "contested" ? "all" : "contested")}>Contestées</button>
                      <button className="admin-export-btn" onClick={generateTransactionsCSV}>
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Exporter CSV
                      </button>
                    </div>
                  </div>
                  <div className="admin-filter-bar">
                    <div className="admin-filter-group">
                      <span className="admin-filter-label">Date début</span>
                      <input className="admin-filter-input" type="date" value={adminTxDateFrom} onChange={(e) => setAdminTxDateFrom(e.target.value)} />
                    </div>
                    <div className="admin-filter-group">
                      <span className="admin-filter-label">Date fin</span>
                      <input className="admin-filter-input" type="date" value={adminTxDateTo} onChange={(e) => setAdminTxDateTo(e.target.value)} />
                    </div>
                    <div className="admin-filter-group">
                      <span className="admin-filter-label">Montant min</span>
                      <input className="admin-filter-input" type="number" placeholder="0" value={adminTxAmountMin} onChange={(e) => setAdminTxAmountMin(e.target.value)} />
                    </div>
                    <div className="admin-filter-group">
                      <span className="admin-filter-label">Montant max</span>
                      <input className="admin-filter-input" type="number" placeholder="∞" value={adminTxAmountMax} onChange={(e) => setAdminTxAmountMax(e.target.value)} />
                    </div>
                    {(adminTxDateFrom || adminTxDateTo || adminTxAmountMin || adminTxAmountMax) && (
                      <button className="admin-filter-clear" onClick={() => { setAdminTxDateFrom(""); setAdminTxDateTo(""); setAdminTxAmountMin(""); setAdminTxAmountMax(""); }}>Réinitialiser</button>
                    )}
                  </div>
                  <div className="admin-table-wrap">
                    {txSearchFilteredAdminTransactions.length === 0 ? (
                      <div className="admin-empty"><div className="admin-empty-icon">📋</div><div className="admin-empty-text">Aucune transaction trouvée.</div></div>
                    ) : (
                      <div className="admin-table-scroll">
                        <table className="admin-table">
                          <thead><tr><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Montant</th><th>Type</th><th>Statut</th></tr></thead>
                          <tbody>
                            {pagedTxSearchTransactions.map((tx, i) => {
                              const txType = getAdminTxTypeLabel(tx.type);
                              const isContested = tx.status === "contested" || tx.status === "flagged";
                              return (
                                <tr key={i} style={{ cursor: "pointer" }} onClick={() => setAdminSelectedTx(tx)}>
                                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(tx.createdAt)}</td>
                                  <td style={{ color: "#fff", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.senderName || tx.senderMoraliId || "—"}</td>
                                  <td style={{ color: "#fff", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.recipientName || tx.recipientMoraliId || "—"}</td>
                                  <td className={tx.type === "depot" || tx.type === "remboursement" ? "admin-amount-pos" : "admin-amount-neg"}>
                                    {tx.type === "depot" || tx.type === "remboursement" ? "+" : "-"} {formatCurrency(tx.amount)} XAF
                                  </td>
                                  <td><span className={`admin-badge ${txType.cls}`}>{txType.label}</span></td>
                                  <td style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span className={`admin-badge ${isContested ? "danger" : "success"}`}>{isContested ? "Contestée" : tx.status === "success" ? "Succès" : String(tx.status ?? "Inconnu")}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {txSearchFilteredAdminTransactions.length > adminTxPerPage && (
                    <div className="admin-pagination">
                      <button disabled={adminTxPage <= 1} onClick={() => setAdminTxPage(adminTxPage - 1)}>←</button>
                      <span className="admin-page-info">Affichage {(adminTxPage - 1) * adminTxPerPage + 1}-{Math.min(adminTxPage * adminTxPerPage, txSearchFilteredAdminTransactions.length)} sur {txSearchFilteredAdminTransactions.length} transactions</span>
                      <button disabled={adminTxPage >= txSearchTotalPages} onClick={() => setAdminTxPage(adminTxPage + 1)}>→</button>
                    </div>
                  )}
                </div>
              )}

              {/* ANALYTICS TAB */}
              {adminTab === "analytics" && (
                <>
                  <div className="admin-top-card">
                    <div className="admin-top-card-item">
                      <div className="admin-top-card-label">Total Dépôts</div>
                      <div className="admin-top-card-value green">{formatCurrency(adminAnalyticsStats.totalDepots)} XAF</div>
                    </div>
                    <div className="admin-top-card-item">
                      <div className="admin-top-card-label">Total Retraits</div>
                      <div className="admin-top-card-value red">{formatCurrency(adminAnalyticsStats.totalRetraits)} XAF</div>
                    </div>
                    <div className="admin-top-card-item">
                      <div className="admin-top-card-label">Total Virements</div>
                      <div className="admin-top-card-value blue">{formatCurrency(adminAnalyticsStats.totalVirements)} XAF</div>
                    </div>
                    <div className="admin-top-card-item">
                      <div className="admin-top-card-label">Solde moyen / utilisateur</div>
                      <div className="admin-top-card-value amber">{formatCurrency(adminAnalyticsStats.avgBalance)} XAF</div>
                    </div>
                  </div>

                  <div className="admin-chart-container">
                    <div className="admin-chart-title">Inscriptions par jour (7 derniers jours)</div>
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={adminInscriptionsPerDay}>
                          <defs>
                            <linearGradient id="inscGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                          <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#inscGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="admin-chart-container">
                    <div className="admin-chart-title">Volume de transactions par jour (7 derniers jours)</div>
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={adminTxVolumePerDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} formatter={(value) => [`${formatCurrency(Number(value ?? 0))} XAF`, ""]} />
                          <Bar dataKey="depot" fill="#22c55e" radius={[4, 4, 0, 0]} name="Dépôts" />
                          <Bar dataKey="retrait" fill="#ef4444" radius={[4, 4, 0, 0]} name="Retraits" />
                          <Bar dataKey="virement" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Virements" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="admin-chart-legend">
                      <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot depot" />Dépôts</div>
                      <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot retrait" />Retraits</div>
                      <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot virement" />Virements</div>
                    </div>
                  </div>

                  <div className="admin-top-users">
                    <div className="admin-top-users-title">Top 5 utilisateurs par volume de transactions</div>
                    {adminTopUsersByVolume.length === 0 ? (
                      <div className="admin-empty" style={{ padding: 16 }}><div className="admin-empty-text">Aucune donnée disponible.</div></div>
                    ) : (
                      adminTopUsersByVolume.map((user, i) => (
                        <div key={user.uid} className="admin-top-user-row">
                          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <div className={`admin-top-user-rank ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "default"}`}>{i + 1}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{user.name}</div>
                              <div style={{ fontSize: 11, color: "#64748b" }}>{adminTransactions.filter((t) => t.senderUid === user.uid || t.recipientUid === user.uid).length} transactions</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa", fontFamily: "'Montserrat',sans-serif" }}>{formatCurrency(user.volume)} XAF</div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Financial Reports */}
                  <div className="admin-report-section">
                    <div className="admin-report-header">
                      <div className="admin-report-title">📊 Rapports financiers</div>
                      <div className="admin-report-modes">
                        <button className={`admin-report-mode ${adminReportMode === "daily" ? "active" : ""}`} onClick={() => setAdminReportMode("daily")}>Quotidien</button>
                        <button className={`admin-report-mode ${adminReportMode === "weekly" ? "active" : ""}`} onClick={() => setAdminReportMode("weekly")}>Hebdomadaire</button>
                        <button className={`admin-report-mode ${adminReportMode === "monthly" ? "active" : ""}`} onClick={() => setAdminReportMode("monthly")}>Mensuel</button>
                      </div>
                      <button className="admin-export-btn" onClick={exportFinancialReportPDF} style={{ marginLeft: "auto" }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Exporter PDF
                      </button>
                    </div>
                    <div className="admin-report-daterange">{adminFinancialReport.rangeLabel}</div>
                    <div className="admin-report-stats">
                      <div className="admin-report-stat">
                        <div className="admin-report-stat-label">Total Dépôts</div>
                        <div className="admin-report-stat-value green">{formatCurrency(adminFinancialReport.totalDepots)} XAF</div>
                      </div>
                      <div className="admin-report-stat">
                        <div className="admin-report-stat-label">Total Retraits</div>
                        <div className="admin-report-stat-value red">{formatCurrency(adminFinancialReport.totalRetraits)} XAF</div>
                      </div>
                      <div className="admin-report-stat">
                        <div className="admin-report-stat-label">Total Virements</div>
                        <div className="admin-report-stat-value blue">{formatCurrency(adminFinancialReport.totalVirements)} XAF</div>
                      </div>
                      <div className="admin-report-stat">
                        <div className="admin-report-stat-label">Net</div>
                        <div className={`admin-report-stat-value ${adminFinancialReport.net >= 0 ? "green" : "red"}`}>{adminFinancialReport.net >= 0 ? "+" : ""}{formatCurrency(adminFinancialReport.net)} XAF</div>
                      </div>
                    </div>
                    {adminFinancialReport.transactions.length > 0 ? (
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        <table className="admin-report-table">
                          <thead><tr><th>Date</th><th>Type</th><th>De</th><th>À</th><th>Montant</th></tr></thead>
                          <tbody>
                            {adminFinancialReport.transactions.slice(0, 20).map((tx, i) => (
                              <tr key={i}>
                                <td style={{ fontSize: 11 }}>{formatAdminDate(tx.createdAt)}</td>
                                <td><span className={`admin-badge ${getAdminTxTypeLabel(tx.type).cls}`} style={{ fontSize: 9 }}>{getAdminTxTypeLabel(tx.type).label}</span></td>
                                <td style={{ fontSize: 11 }}>{tx.senderName || "—"}</td>
                                <td style={{ fontSize: 11 }}>{tx.recipientName || "—"}</td>
                                <td style={{ fontWeight: 700, fontSize: 11 }}>{formatCurrency(tx.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: 20, color: "#64748b", fontSize: 12 }}>Aucune transaction dans cette période</div>
                    )}
                  </div>
                </>
              )}

              {/* LOANS TAB */}
              {adminTab === "loans" && (
                <>
                  {adminLoansLoading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                      <div className="btn-loader" style={{ margin: "0 auto 12px", borderTopColor: "#60a5fa" }} />
                      <div style={{ fontSize: 13 }}>Chargement des demandes...</div>
                    </div>
                  ) : (
                    <>
                      {/* Loan stats */}
                      <div className="admin-top-card">
                        <div className="admin-top-card-item">
                          <div className="admin-top-card-label">En attente</div>
                          <div className="admin-top-card-value amber">{adminLoans.filter((l) => l.status === "pending").length}</div>
                        </div>
                        <div className="admin-top-card-item">
                          <div className="admin-top-card-label">Approuvés</div>
                          <div className="admin-top-card-value green">{adminLoans.filter((l) => l.status === "success").length}</div>
                        </div>
                        <div className="admin-top-card-item">
                          <div className="admin-top-card-label">Refusés</div>
                          <div className="admin-top-card-value red">{adminLoans.filter((l) => l.status === "contested").length}</div>
                        </div>
                      </div>

                      {/* Pending loans */}
                      <div className="admin-section-title" style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12, padding: "0 2px" }}>
                        Demandes en attente ({adminLoans.filter((l) => l.status === "pending").length})
                      </div>
                      {adminLoans.filter((l) => l.status === "pending").length === 0 ? (
                        <div className="admin-empty" style={{ padding: 24 }}>
                          <div className="admin-empty-text">Aucune demande de prêt en attente.</div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {adminLoans.filter((l) => l.status === "pending").map((loan: AdminLoanRecord) => (
                            <div key={loan.id} style={{
                              padding: 16, borderRadius: 16,
                              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{loan.senderName || "Utilisateur inconnu"}</div>
                                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                                    {loan.senderMoraliId || ""} · Prêt Personnel
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
                                  background: loan.loanType === "micro" ? "rgba(244,63,94,0.12)" : "rgba(59,130,246,0.12)",
                                  color: loan.loanType === "micro" ? "#fb7185" : "#60a5fa"
                                }}>
                                  {loan.loanType === "micro" ? "Microcrédit" : "Personnel"}
                                </span>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                  <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Montant</div>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e", fontFamily: "'Montserrat',sans-serif", marginTop: 3 }}>{formatCurrency(loan.amount)} F</div>
                                </div>
                                <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                  <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Total à rembourser</div>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", fontFamily: "'Montserrat',sans-serif", marginTop: 3 }}>{formatCurrency(loan.totalToRepay || loan.amount)} F</div>
                                </div>
                                <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                  <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Durée</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 3 }}>{loan.durationLabel || `${loan.duration} jours`}</div>
                                </div>
                                <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                  <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Date</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginTop: 3 }}>
                                    {loan.createdAt && typeof loan.createdAt === "object" && "seconds" in loan.createdAt
                                      ? new Date((loan.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString("fr-FR")
                                      : "—"}
                                  </div>
                                </div>
                              </div>
                              {adminPermissionLevel === "full" && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <button
                                  onClick={() => handleAdminApproveLoan(loan)}
                                  style={{
                                    height: 40, borderRadius: 12, border: "none", cursor: "pointer",
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff",
                                    fontSize: 13, fontWeight: 800, boxShadow: "0 4px 12px rgba(34,197,94,0.3)",
                                    transition: "all 0.2s",
                                  }}
                                >✓ Approuver</button>
                                <button
                                  onClick={() => handleAdminRejectLoan(loan)}
                                  style={{
                                    height: 40, borderRadius: 12, border: "none", cursor: "pointer",
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff",
                                    fontSize: 13, fontWeight: 800, boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
                                    transition: "all 0.2s",
                                  }}
                                >✗ Refuser</button>
                              </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Processed loans */}
                      <div className="admin-section-title" style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12, marginTop: 20, padding: "0 2px" }}>
                        Historique ({adminLoans.filter((l) => l.status !== "pending").length})
                      </div>
                      {adminLoans.filter((l) => l.status !== "pending").length === 0 ? (
                        <div className="admin-empty" style={{ padding: 24 }}>
                          <div className="admin-empty-text">Aucun historique de traitement.</div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {adminLoans.filter((l) => l.status !== "pending").map((loan: AdminLoanRecord) => (
                            <div key={loan.id} style={{
                              padding: 12, borderRadius: 12,
                              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{loan.senderName || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {loan.loanType === "micro" ? "Microcrédit" : "Prêt Personnel"}</span></div>
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{formatCurrency(loan.amount)} F</div>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
                                background: loan.status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                                color: loan.status === "approved" ? "#4ade80" : "#f87171",
                              }}>
                                {loan.status === "approved" ? "Approuvé" : "Refusé"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* AUDIT LOG TAB */}
              {adminTab === "audit" && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div className="admin-section-title">Journal d'audit</div>
                    <button className="admin-filter-clear" onClick={() => setAuditLogRefreshKey((k) => k + 1)}>Rafraîchir</button>
                  </div>
                  <div className="admin-table-wrap">
                    {auditLogs.length === 0 ? (
                      <div className="admin-empty"><div className="admin-empty-icon">📜</div><div className="admin-empty-text">Aucune action enregistrée.</div></div>
                    ) : (
                      <div className="admin-table-scroll">
                        <table className="admin-table">
                          <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead>
                          <tbody>
                            {auditLogs.slice(0, 50).map((log, i: number) => (
                              <tr key={String((log as Record<string, unknown>).id || i)}>
                                <td style={{ color: "#94a3b8", fontSize: 12 }}>{(log as Record<string, unknown>).createdAt ? new Date((log as Record<string, unknown>).createdAt as string | number | Date).toLocaleString("fr-FR") : "—"}</td>
                                <td style={{ fontWeight: 600, color: "#fff" }}>{String((log as Record<string, unknown>).adminName || "—")}</td>
                                <td><span className="admin-badge success">{String((log as Record<string, unknown>).action || "—")}</span></td>
                                <td style={{ color: "#94a3b8", fontSize: 12 }}>{String((log as Record<string, unknown>).target || "—")}</td>
                                <td style={{ color: "#64748b", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{String((log as Record<string, unknown>).details || "—")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SETTINGS TAB */}
              {adminTab === "settings" && (
                <>
                  <div className="admin-settings-grid">
                    <div className="admin-setting-card">
                      <div className="admin-setting-title">🏦 Nom de la banque</div>
                      <div className="admin-setting-desc">Nom affiché dans l'application et les documents officiels.</div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Nom</span>
                        <input className="admin-setting-input" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: 180 }} />
                      </div>
                    </div>

                    <div className="admin-setting-card">
                      <div className="admin-setting-title">💰 Configuration financière</div>
                      <div className="admin-setting-desc">Paramètres financiers par défaut pour les nouveaux utilisateurs et les opérations.</div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Solde par défaut (XAF)</span>
                        <input className="admin-setting-input" type="number" value={defaultBalance} onChange={(e) => setDefaultBalance(e.target.value)} />
                      </div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Mode de frais</span>
                        <div className="admin-fee-toggle">
                          <button className={`admin-fee-toggle-btn ${adminFeeMode === "fixed" ? "active" : ""}`} onClick={() => setAdminFeeMode("fixed")}>Montant fixe</button>
                          <button className={`admin-fee-toggle-btn ${adminFeeMode === "percentage" ? "active" : ""}`} onClick={() => setAdminFeeMode("percentage")}>Pourcentage</button>
                        </div>
                      </div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">{adminFeeMode === "fixed" ? "Frais de transfert (XAF)" : "Frais de transfert (%)"}</span>
                        <input className="admin-setting-input" type="number" value={transferFee} onChange={(e) => setTransferFee(e.target.value)} min="0" step={adminFeeMode === "percentage" ? "0.1" : "100"} />
                      </div>
                      <div className="admin-fee-example">{adminFeeExample}</div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Limite max transfert (XAF)</span>
                        <input className="admin-setting-input" type="number" value={maxTransferLimit} onChange={(e) => setMaxTransferLimit(e.target.value)} />
                      </div>
                    </div>

                    <div className="admin-setting-card">
                      <div className="admin-setting-title">🔒 Maintenance</div>
                      <div className="admin-setting-desc">Activez le mode maintenance pour empêcher les connexions et transactions utilisateur.</div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Mode maintenance</span>
                        <div className={`admin-toggle ${maintenanceMode ? "danger-active" : ""}`} onClick={() => setMaintenanceMode(!maintenanceMode)} />
                      </div>
                    </div>

                    <div className="admin-setting-card">
                      <div className="admin-setting-title">📊 Statistiques rapides</div>
                      <div className="admin-setting-desc">Vue d'ensemble du système en temps réel.</div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Utilisateurs actifs</span>
                        <span style={{ fontWeight: 800, color: "#4ade80" }}>{adminUsers.length}</span>
                      </div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Transactions totales</span>
                        <span style={{ fontWeight: 800, color: "#60a5fa" }}>{adminTransactions.length}</span>
                      </div>
                      <div className="admin-setting-row">
                        <span className="admin-setting-label">Volume total</span>
                        <span style={{ fontWeight: 800, color: "#fbbf24" }}>{formatCurrency(adminTotalTransactions)} XAF</span>
                      </div>
                    </div>
                  </div>

                  {/* Activity Log */}
                  <div className="admin-section" style={{ marginTop: 24 }}>
                    <div className="admin-section-header">
                      <div className="admin-section-title">📝 Journal d'activité</div>
                      <span className="admin-section-title" style={{ fontSize: 12, color: "#64748b" }}>{adminActivityLog.length} actions</span>
                    </div>
                    <div className="admin-chart-container" style={{ padding: 0 }}>
                      {adminActivityLog.length === 0 ? (
                        <div className="admin-empty" style={{ padding: 24 }}><div className="admin-empty-icon">📝</div><div className="admin-empty-text">Aucune activité enregistrée.</div></div>
                      ) : (
                        <div className="admin-activity-log" style={{ padding: "8px 16px" }}>
                          {adminActivityLog.map((log, i) => {
                            const isDanger = log.action.includes("Suppression") || log.action.includes("Suspension");
                            const isSuccess = log.action.includes("Dépôt") || log.action.includes("Réactivation") || log.action.includes("Remboursement");
                            const isWarning = log.action.includes("Retrait") || log.action.includes("PIN");
                            return (
                              <div key={i} className="admin-activity-item">
                                <div className={`admin-activity-dot ${isDanger ? "danger" : isSuccess ? "success" : isWarning ? "warning" : ""}`} />
                                <div className="admin-activity-content">
                                  <div className="admin-activity-action">{log.action}</div>
                                  <div className="admin-activity-detail">{log.detail}</div>
                                  <div className="admin-activity-time">{log.timestamp.toLocaleString("fr-FR")}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* System Health */}
                  <div className="admin-health-card">
                    <div className="admin-health-title">🩺 État du système</div>
                    <div className="admin-health-grid">
                      <div className="admin-health-item">
                        <div className="admin-health-label">Firebase</div>
                        <div className="admin-health-value">
                          <span className="admin-health-badge green">✅ Connecté</span>
                        </div>
                      </div>
                      <div className="admin-health-item">
                        <div className="admin-health-label">Utilisateurs</div>
                        <div className="admin-health-value">{adminUsers.length}</div>
                      </div>
                      <div className="admin-health-item">
                        <div className="admin-health-label">Transactions</div>
                        <div className="admin-health-value">{adminTransactions.length}</div>
                      </div>
                      <div className="admin-health-item">
                        <div className="admin-health-label">Dernière maj</div>
                        <div className="admin-health-value" style={{ fontSize: 11, color: "#94a3b8" }}>{adminLastRefresh.toLocaleTimeString("fr-FR")}</div>
                      </div>
                      <div className="admin-health-item">
                        <div className="admin-health-label">Taille données</div>
                        <div className="admin-health-value">{adminUsers.length + adminTransactions.length} entrées</div>
                      </div>
                      <div className="admin-health-item">
                        <div className="admin-health-label">Auto-refresh</div>
                        <div className="admin-health-value">
                          <span className="admin-health-badge green">Toutes les 15s</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reset Data Card */}
                  {adminPermissionLevel === "full" && (
                  <div className="admin-setting-card" style={{ marginTop: 20, borderColor: "rgba(239,68,68,0.3)" }}>
                    <div className="admin-setting-title" style={{ color: "#ef4444" }}>🗑️ Réinitialisation des données</div>
                    <div className="admin-setting-desc">Choisissez quoi réinitialiser. Ces actions sont irréversibles.</div>
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { key: "transactions", label: "Transactions", desc: "Supprimer toutes les transactions", icon: "📈" },
                        { key: "notifications", desc: "Supprimer toutes les notifications", icon: "🔔", label: "Notifications" },
                        { key: "balances", label: "Soldes", desc: "Remettre tous les soldes à 0", icon: "💰" },
                        { key: "all", label: "Tout réinitialiser", desc: "Transactions + Notifications + Soldes", icon: "⚠️" },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          className="admin-fee-toggle-btn"
                          style={{ background: resetDataConfirm === opt.key ? "#ef4444" : "rgba(255,255,255,0.04)", color: "#fff", padding: "10px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%" }}
                          onClick={async () => {
                            if (resetDataConfirm !== opt.key) {
                              setResetDataConfirm(opt.key);
                              setTimeout(() => setResetDataConfirm(false), 8000);
                              return;
                            }
                            // Confirmed — execute reset
                            setResetDataLoading(true);
                            try {
                              const headers = await getAuthHeaders();
                              const actionName = opt.key === "all" ? "RESET_ALL" : `RESET_${opt.key.toUpperCase()}`;
                              const confirmToken = `CONFIRM_${actionName}_${(firebaseAuth.currentUser?.uid || "").slice(0, 8)}`;
                              const res = await fetch("/api/admin/log", {
                                method: "POST",
                                headers: { ...headers, "Content-Type": "application/json" },
                                body: JSON.stringify({ action: actionName, details: `Admin reset: ${opt.label}`, confirmToken }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast(`✅ ${opt.label} réinitialisé(s) avec succès`);
                                setAdminTransactions([]);
                                if (opt.key === "balances" || opt.key === "all") setAdminUsers(u => u.map(usr => ({ ...usr, balance: 0 })));
                                setTimeout(() => window.location.reload(), 2000);
                              } else {
                                showToast("❌ Erreur: " + (data.error || "Échec"));
                              }
                            } catch {
                              showToast("❌ Erreur de connexion");
                            } finally {
                              setResetDataLoading(false);
                              setResetDataConfirm(false);
                            }
                          }}
                          disabled={resetDataLoading}
                        >
                          <span style={{ fontSize: 18 }}>{opt.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{resetDataLoading && resetDataConfirm === opt.key ? "⏳ Réinitialisation..." : resetDataConfirm === opt.key ? `⚠️ Confirmer : ${opt.label}` : opt.label}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{opt.desc}</div>
                          </div>
                        </button>
                      ))}
                      {resetDataConfirm && (
                        <button
                          className="admin-fee-toggle-btn"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", padding: "8px 20px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, cursor: "pointer", fontSize: 13 }}
                          onClick={() => setResetDataConfirm(false)}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Admin Roles */}
                  {adminPermissionLevel === "full" && (
                  <div className="admin-admin-roles-section">
                    <div className="admin-admin-roles-title">🛡️ Gestion des rôles</div>
                    {adminAdminUsers.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#64748b", fontSize: 12 }}>Aucun administrateur trouvé</div>
                    ) : (
                      adminAdminUsers.map((admin) => (
                        <div key={admin.uid} className="admin-admin-role-row">
                          <div className="admin-admin-role-info">
                            <div className="admin-admin-role-avatar">{getAdminUserInitials(admin)}</div>
                            <div>
                              <div className="admin-admin-role-name">{admin.fullName || admin.pseudo || "Admin"}</div>
                              <div className="admin-admin-role-email">{admin.email || "—"}</div>
                            </div>
                          </div>
                          <select
                            className="admin-admin-role-select"
                            value={(admin as Record<string, unknown>).adminRole as string || "moderator"}
                            onChange={(e) => handleAdminChangeRole(admin.uid, e.target.value)}
                          >
                            <option value="super-admin">Super Admin</option>
                            <option value="moderator">Modérateur</option>
                            <option value="support">Support</option>
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                  )}

                  {/* Backup & Restore */}
                  <div className="admin-backup-section">
                    <div className="admin-backup-title">💾 Sauvegarde & Restauration</div>
                    <div className="admin-backup-desc">Exportez toutes les données en JSON ou restaurez depuis un fichier de sauvegarde.</div>
                    <div className="admin-backup-actions">
                      <button className="admin-backup-btn" onClick={handleAdminBackup} disabled={adminBackupLoading}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {adminBackupLoading ? "Export en cours..." : "Exporter toutes les données"}
                      </button>
                      <label className="admin-backup-btn danger">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {adminBackupLoading ? "Import en cours..." : "Restaurer des données"}
                        <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAdminRestore(file); e.target.value = ""; }} disabled={adminBackupLoading} />
                      </label>
                    </div>
                    <div className="admin-backup-warning">⚠️ La restauration écrasera les données existantes. Utilisez avec précaution.</div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>

    {/* User Detail Overlay */}
    {adminSelectedUser && (
      <div className="admin-user-detail-overlay" onClick={() => { setAdminSelectedUser(null); setAdminBalanceEditMode(null); setAdminNotifForm({ title: "", message: "", open: false }); }}>
        <div className="admin-user-detail-card" onClick={(e) => e.stopPropagation()}>
          <div className="admin-user-detail-scroll">
            {/* Header */}
            <div className="admin-user-detail-header">
              <div className="admin-user-detail-avatar">{getAdminUserInitials(adminSelectedUser)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-user-detail-name">{adminSelectedUser.fullName || adminSelectedUser.pseudo || "—"}</div>
                <div className="admin-user-detail-email">{adminSelectedUser.email || "—"}</div>
                {adminSelectedUser.accountStatus === "suspended" && <span className="admin-badge danger" style={{ marginTop: 4, fontSize: 9 }}>Suspendu</span>}
              </div>
            </div>

            {/* Balance HERO */}
            <div className="admin-balance-hero">
              <div className="admin-balance-hero-label">Solde disponible</div>
              <div className="admin-balance-hero-value">{formatCurrency(adminSelectedUser.balance || 0)}</div>
              <div className="admin-balance-hero-currency">XAF — Franc CFA</div>
            </div>

            {/* ID Morali — Copyable */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <div
                className="admin-copyable-id"
                onClick={() => {
                  const id = adminSelectedUser.moraliId || "";
                  if (id) { navigator.clipboard.writeText(id).then(() => showToast("ID Morali copié !")).catch(() => showToast("ID Morali copié !")); }
                }}
                title="Cliquer pour copier"
              >
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                {adminSelectedUser.moraliId || "—"}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="admin-user-detail-stats" style={{ marginBottom: 20 }}>
              <div className="admin-user-detail-stat">
                <div className="admin-user-detail-stat-label">Téléphone</div>
                <div className="admin-user-detail-stat-value">{adminSelectedUser.phone || "—"}</div>
              </div>
              <div className="admin-user-detail-stat">
                <div className="admin-user-detail-stat-label">Pseudo</div>
                <div className="admin-user-detail-stat-value">{adminSelectedUser.pseudo && adminSelectedUser.pseudo.startsWith("@") ? adminSelectedUser.pseudo : adminSelectedUser.pseudo ? `@${adminSelectedUser.pseudo}` : "—"}</div>
              </div>
            </div>

            <hr className="admin-glass-divider" />

            {/* Financial Actions Group */}
            {adminPermissionLevel === "full" && (
              <div className="admin-action-group">
                <div className="admin-action-group-title">💰 Opérations financières</div>
                <div className="admin-action-row">
                  <button className="admin-action-btn green" onClick={() => setAdminBalanceEditMode(adminBalanceEditMode === "add" ? null : "add")}>
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ajouter des fonds
                  </button>
                  <button className="admin-action-btn amber" onClick={() => setAdminBalanceEditMode(adminBalanceEditMode === "subtract" ? null : "subtract")}>
                    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Retirer des fonds
                  </button>
                </div>
                {adminBalanceEditMode && (
                  <div className="admin-inline-form" style={{ marginTop: 10 }}>
                    <input type="number" placeholder="Montant (XAF)" value={adminBalanceEditAmount} onChange={(e) => setAdminBalanceEditAmount(e.target.value)} min="1" />
                    <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminBalanceEdit(adminBalanceEditMode); }}>Confirmer</button>
                    <button className="admin-inline-form-btn cancel" onClick={() => { setAdminBalanceEditMode(null); setAdminBalanceEditAmount(""); }}>Annuler</button>
                  </div>
                )}
              </div>
            )}

            {/* Account Actions Group */}
            {adminPermissionLevel === "full" && (
              <div className="admin-action-group">
                <div className="admin-action-group-title">🛠️ Gestion du compte</div>
                <div className="admin-action-row">
                  <button className={`admin-action-btn ${adminSelectedUser.accountStatus === "suspended" ? "green" : "red"}`} onClick={() => { handleAdminSuspendUser(); showToast(adminSelectedUser.accountStatus === "suspended" ? "Compte réactivé" : "Compte suspendu"); }}>
                    <svg viewBox="0 0 24 24">{adminSelectedUser.accountStatus === "suspended" ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> : <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>}</svg>
                    {adminSelectedUser.accountStatus === "suspended" ? "Réactiver" : "Suspendre"}
                  </button>
                  <button className="admin-action-btn blue" onClick={() => { handleAdminResetPin(); showToast("PIN réinitialisé"); }}>
                    <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Réinitialiser PIN
                  </button>
                  <button className="admin-action-btn" onClick={() => setAdminNotifForm({ ...adminNotifForm, open: !adminNotifForm.open })}>
                    <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    Notification
                  </button>
                </div>
              </div>
            )}

            {/* Notification Form */}
            {adminNotifForm.open && (
              <div className="admin-notif-form" style={{ marginBottom: 10 }}>
                <div className="admin-notif-form-title">Envoyer une notification</div>
                <div className="admin-notif-form-field">
                  <label>Titre</label>
                  <input value={adminNotifForm.title} onChange={(e) => setAdminNotifForm({ ...adminNotifForm, title: e.target.value })} placeholder="Titre de la notification" />
                </div>
                <div className="admin-notif-form-field">
                  <label>Message</label>
                  <textarea rows={3} value={adminNotifForm.message} onChange={(e) => setAdminNotifForm({ ...adminNotifForm, message: e.target.value })} placeholder="Contenu de la notification..." />
                </div>
                <div className="admin-notif-form-actions">
                  <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminSendNotification(); showToast("Notification envoyée"); }} disabled={!adminNotifForm.title || !adminNotifForm.message}>Envoyer</button>
                  <button className="admin-inline-form-btn cancel" onClick={() => setAdminNotifForm({ title: "", message: "", open: false })}>Annuler</button>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            {adminPermissionLevel === "full" && (
              <div className="admin-action-group danger">
                <div className="admin-action-group-title">⚠️ Zone dangereuse</div>
                <div className="admin-action-row">
                  <button className="admin-action-btn danger" onClick={() => setAdminConfirmAction({ type: "delete-user", message: `Supprimer définitivement l'utilisateur "${adminSelectedUser.fullName || adminSelectedUser.pseudo}" ? Cette action est irréversible.` })}>
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Supprimer le compte
                  </button>
                </div>
              </div>
            )}

            <hr className="admin-glass-divider" />

            {/* Modifier le profil */}
            <div className="admin-profile-edit" style={{ marginBottom: 16 }}>
              <div className="admin-profile-edit-title">✏️ Modifier le profil</div>
              {[
                { key: "firstName", label: "Prénom", value: adminSelectedUser.firstName || "" },
                { key: "lastName", label: "Nom", value: adminSelectedUser.lastName || "" },
                { key: "phone", label: "Téléphone", value: adminSelectedUser.phone || "" },
                { key: "pseudo", label: "Pseudo", value: adminSelectedUser.pseudo || "" },
              ].map((field) => (
                <div key={field.key} className="admin-profile-field">
                  <span className="admin-profile-field-label">{field.label}</span>
                  {adminEditingField === field.key ? (
                    <div className="admin-profile-field-edit">
                      <input
                        value={adminEditValue}
                        onChange={(e) => setAdminEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleAdminEditProfileField(field.key); showToast("Profil mis à jour"); } if (e.key === "Escape") { setAdminEditingField(null); setAdminEditValue(""); } }}
                        autoFocus
                      />
                      <button className="admin-mini-btn save" onClick={() => { handleAdminEditProfileField(field.key); showToast("Profil mis à jour"); }}>✓</button>
                      <button className="admin-mini-btn" onClick={() => { setAdminEditingField(null); setAdminEditValue(""); }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                      <span className="admin-profile-field-value">{field.value || "—"}</span>
                      <button className="admin-mini-btn" onClick={() => { setAdminEditingField(field.key); setAdminEditValue(field.value); }}>✏️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Limites personnalisés */}
            <div className="admin-limits-section" style={{ marginBottom: 16 }}>
              <div className="admin-limits-title" style={{ cursor: "pointer" }} onClick={() => { setAdminLimitEditOpen(!adminLimitEditOpen); setAdminUserLimits({ dailyLimit: String((adminSelectedUser as Record<string, unknown>).dailyLimit || ""), txLimit: String((adminSelectedUser as Record<string, unknown>).txLimit || "") }); }}>
                ⚙️ Limites personnalisés {adminLimitEditOpen ? "▾" : "▸"}
              </div>
              <div className="admin-limit-field">
                <span className="admin-limit-label">Limite quotidienne</span>
                <span className="admin-limit-value">{(adminSelectedUser as Record<string, unknown>).dailyLimit ? `${formatCurrency(Number((adminSelectedUser as Record<string, unknown>).dailyLimit))} XAF` : "Non définie"}</span>
              </div>
              <div className="admin-limit-field">
                <span className="admin-limit-label">Limite par transaction</span>
                <span className="admin-limit-value">{(adminSelectedUser as Record<string, unknown>).txLimit ? `${formatCurrency(Number((adminSelectedUser as Record<string, unknown>).txLimit))} XAF` : "Non définie"}</span>
              </div>
              {adminLimitEditOpen && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input className="admin-filter-input" type="number" placeholder="Limite quotidienne (XAF)" value={adminUserLimits.dailyLimit} onChange={(e) => setAdminUserLimits({ ...adminUserLimits, dailyLimit: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                  <input className="admin-filter-input" type="number" placeholder="Limite par tx (XAF)" value={adminUserLimits.txLimit} onChange={(e) => setAdminUserLimits({ ...adminUserLimits, txLimit: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                  <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminSaveUserLimits(); showToast("Limites mises à jour"); }} style={{ padding: "6px 14px", fontSize: 11 }}>Sauvegarder</button>
                </div>
              )}
            </div>

            <hr className="admin-glass-divider" />

            {/* Recent Transactions */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>Transactions récentes</div>
              {adminTransactions.filter((t) => t.senderUid === adminSelectedUser.uid || t.recipientUid === adminSelectedUser.uid).length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: 16 }}>Aucune transaction</div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {adminTransactions.filter((t) => t.senderUid === adminSelectedUser.uid || t.recipientUid === adminSelectedUser.uid).slice(0, 10).map((tx, i) => {
                    const isSender = tx.senderUid === adminSelectedUser.uid;
                    const txType = getAdminTxTypeLabel(tx.type);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{isSender ? `→ ${tx.recipientName || tx.recipientMoraliId}` : `← ${tx.senderName || tx.senderMoraliId}`}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{formatAdminDate(tx.createdAt)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={`admin-badge ${txType.cls}`} style={{ fontSize: 9 }}>{txType.label}</span>
                          <span style={{ fontWeight: 700, color: isSender ? "#ef4444" : "#4ade80", fontSize: 13 }}>
                            {isSender ? "-" : "+"}{formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <button className="admin-user-detail-close" onClick={() => { setAdminSelectedUser(null); setAdminBalanceEditMode(null); setAdminNotifForm({ title: "", message: "", open: false }); }}>Fermer</button>
        </div>
      </div>
    )}

    {/* Transaction Detail Modal */}
    {adminSelectedTx && (
      <div className="admin-tx-detail-overlay" onClick={() => setAdminSelectedTx(null)}>
        <div className="admin-tx-detail-card" onClick={(e) => e.stopPropagation()}>
          <div className="admin-tx-detail-header">
            <div className="admin-tx-detail-title">Détails de la transaction</div>
            <button className="admin-tx-detail-close" onClick={() => setAdminSelectedTx(null)}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="admin-tx-detail-amount">
            <div className="admin-tx-detail-amount-value" style={{ color: adminSelectedTx.type === "depot" || adminSelectedTx.type === "remboursement" ? "#4ade80" : "#ef4444" }}>
              {adminSelectedTx.type === "depot" || adminSelectedTx.type === "remboursement" ? "+" : "-"} {formatCurrency(adminSelectedTx.amount)} XAF
            </div>
            <span className={`admin-badge ${getAdminTxTypeLabel(adminSelectedTx.type).cls}`} style={{ marginTop: 8 }}>{getAdminTxTypeLabel(adminSelectedTx.type).label}</span>
          </div>
          <div className="admin-tx-detail-grid">
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">Date</div>
              <div className="admin-tx-detail-value">{formatAdminDate(adminSelectedTx.createdAt)}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">Statut</div>
              <div className="admin-tx-detail-value pos">{adminSelectedTx.status === "success" ? "Succès" : String(adminSelectedTx.status ?? "Inconnu")}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">Expéditeur</div>
              <div className="admin-tx-detail-value">{adminSelectedTx.senderName || adminSelectedTx.senderMoraliId || "—"}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">ID Expéditeur</div>
              <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#60a5fa" }}>{adminSelectedTx.senderMoraliId || adminSelectedTx.senderUid || "—"}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">Destinataire</div>
              <div className="admin-tx-detail-value">{adminSelectedTx.recipientName || adminSelectedTx.recipientMoraliId || "—"}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">ID Destinataire</div>
              <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#60a5fa" }}>{adminSelectedTx.recipientMoraliId || adminSelectedTx.recipientUid || "—"}</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">Frais</div>
              <div className="admin-tx-detail-value">{formatCurrency(adminSelectedTx.fees)} XAF</div>
            </div>
            <div className="admin-tx-detail-field">
              <div className="admin-tx-detail-label">N° Reçu</div>
              <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#94a3b8" }}>{adminSelectedTx.receiptId || "—"}</div>
            </div>
          </div>
          {adminSelectedTx.type === "virement" && (
            <button className="admin-action-btn amber" style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 13 }} onClick={() => setAdminConfirmAction({ type: "refund-tx", data: adminSelectedTx, message: `Rembourser ${formatCurrency(adminSelectedTx.amount)} XAF à ${adminSelectedTx.senderName || adminSelectedTx.senderMoraliId} ? Le montant sera crédité à l'expéditeur et débité du destinataire.` })}>
              <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Rembourser cette transaction
            </button>
          )}
          {adminSelectedTx.status !== "contested" && adminSelectedTx.status !== "flagged" && (
            <button className="admin-tx-detail-contest-btn" onClick={() => handleAdminContestTx(adminSelectedTx)}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Marquer comme contestée
            </button>
          )}
          {(adminSelectedTx.status === "contested" || adminSelectedTx.status === "flagged") && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <span className="admin-tx-contested-badge">⚠️ Contestée</span>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Confirmation Dialog */}
    {adminConfirmAction && (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setAdminConfirmAction(null)}>
        <div style={{ background: "linear-gradient(145deg, #1a1a2e, #16213e)", borderRadius: 20, padding: "28px 24px", maxWidth: 380, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid rgba(212,164,55,0.2)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1.5px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 8 }}>Confirmation requise</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 1.5, marginBottom: 24 }}>{adminConfirmAction.message}</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setAdminConfirmAction(null)} style={{ flex: 1, height: 46, borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
            <button onClick={() => {
              if (adminConfirmAction.type === "delete-user") handleAdminDeleteUser();
              else if (adminConfirmAction.type === "refund-tx") handleAdminRefund(adminConfirmAction.data as FirestoreTransfer);
            }} style={{ flex: 1, height: 46, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 15px rgba(220,38,38,0.4)" }}>Confirmer</button>
          </div>
        </div>
      </div>
    )}
  </div>
)}

    </>
  );
});

export default AdminDashboard;
