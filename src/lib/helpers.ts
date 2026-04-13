// ── MORALI PAY — Shared Utilities ──
// Extracted from MoraliApp.tsx for component reusability

import type { FirestoreMoraliUser } from "@/types/morali";

// ── Input sanitization ──
export const sanitizeInput = (value: string, maxLen = 200): string =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/['"\\]/g, "")
    .trim()
    .slice(0, maxLen);

export const sanitizeAmount = (value: string): number => {
  const num = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) && num >= 0 ? num : NaN;
};

// ── Formatting ──
export function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.abs(value));
}

export function formatAmount(value: number, type: "credit" | "debit") {
  const sign = type === "credit" ? "+" : "-";
  return `${sign} FCFA ${formatCurrency(value)}`;
}

export function formatStat(value: number, type: "credit" | "debit") {
  const abs = formatCurrency(Math.abs(value));
  return type === "credit" ? `+ ${abs}` : `- ${abs}`;
}

export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return "À l'instant";
  if (seconds < 60) return `Il y a ${seconds}s`;
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  const d = new Date(timestamp);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Password strength ──
export function getStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  let label = "";
  let cls = "";
  if (score <= 1) {
    label = password ? "Faible" : "";
    cls = "w";
  } else if (score <= 2) {
    label = "Moyen";
    cls = "m";
  } else if (score === 3) {
    label = "Fort";
    cls = "s";
  } else {
    label = "Très fort";
    cls = "s";
  }

  return { score, label, cls };
}

// ── Firebase Auth error messages ──
export const firebaseAuthMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "Cet email est déjà utilisé.";
    case "auth/invalid-email":
      return "Adresse email invalide.";
    case "auth/weak-password":
      return "Mot de passe trop faible.";
    case "auth/operation-not-allowed":
      return "Méthode de connexion non activée dans Firebase.";
    case "auth/network-request-failed":
      return "Problème réseau. Vérifiez votre connexion.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Identifiants incorrects.";
    default:
      return error instanceof Error ? error.message : "Une erreur est survenue.";
  }
};

// ── Morali Identity Generation ──
export const getIdentitySeed = (email?: string | null, uid?: string | null) => {
  const normalizedEmail = (email || "").trim().toLowerCase();
  return normalizedEmail || uid || "morali-default";
};

export const generateMoraliIdentity = (seed?: string) => {
  const source = seed && seed.trim() ? seed.trim() : "morali-default";
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash * 1099511628) + source.charCodeAt(i)) % 900000000;
  }
  const suffix = String(hash + 1).padStart(9, "0").slice(-9);
  const suffix5 = suffix.slice(0, 5);
  const suffix4 = suffix.slice(0, 4);
  return {
    id: `MORALI${suffix5}`,
    rib: `MOKG-242-2028-${suffix4}`,
  };
};

export const getIdentityCacheKey = (uid: string) => `morali_identity_${uid}`;

export const getCachedIdentityForUid = (uid: string) => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getIdentityCacheKey(uid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; rib?: string };
    if (parsed?.id && parsed?.rib) return { id: parsed.id, rib: parsed.rib };
    return null;
  } catch {
    return null;
  }
};

export const cacheIdentityForUid = (uid: string, identity: { id: string; rib: string }) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getIdentityCacheKey(uid), JSON.stringify(identity));
};

// ── Auth headers helper ──
export const getAuthHeaders = async (getAuth: () => { getIdToken: () => Promise<string> } | null): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (getAuth) {
    try {
      const token = await getAuth.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch { /* token fetch failed */ }
  }
  return headers;
};

// ── Card utilities ──
export const maskCardNumber = (num: string) => {
  const parts = num.split(" ");
  if (parts.length === 4) return `${parts[0]} •••• •••• ${parts[3]}`;
  return num;
};

export const generateCardNumber = () => {
  const blocks = Array.from({ length: 4 }, () => String(1000 + Math.floor(Math.random() * 9000)));
  return `${blocks[0]} ${blocks[1]} ${blocks[2]} ${blocks[3]}`;
};

// ── Build Morali user from directory data ──
export const buildMoraliUser = (d: { uid: string; fullName?: string; pseudo?: string; moraliId?: string }) => ({
  name: d.fullName || "Utilisateur",
  pseudo: d.pseudo?.startsWith("@") ? d.pseudo : `@${d.pseudo || ""}`,
  account: d.moraliId || "MORALI00000",
  uid: d.uid,
  tone: "grad-blue" as const,
});

// ── Chart data helper ──
export const chartDays = (() => {
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const days = [];
  for (let d = 6; d >= 0; d--) {
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
  return days;
})();
