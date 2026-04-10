// ── Shared Firestore Helpers ──
// Extracted from MoraliApp.tsx for use by multiple components

import type { FirestoreNotification, FirestoreTransfer } from "@/types/morali";

/** Get auth headers with Firebase ID token */
export const getAuthHeaders = async (getAuth: () => { getIdToken: () => Promise<string> } | null): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = getAuth();
  if (auth) {
    try {
      const token = await auth.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch { /* token unavailable */ }
  }
  return headers;
};

/** Create a realtime notification via API */
export const createRealtimeNotification = async (
  targetUid: string,
  item: FirestoreNotification,
  getAuth: () => { getIdToken: () => Promise<string> } | null,
) => {
  try {
    const apiRes = await fetch("/api/notifications/create", {
      method: "POST",
      headers: await getAuthHeaders(getAuth),
      body: JSON.stringify({ uid: targetUid, ...item }),
    });
    await apiRes.json().catch(() => ({}));
  } catch { /* notification failed */ }
};

/** Create a realtime transaction record via API */
export const createRealtimeTransaction = async (
  payload: FirestoreTransfer,
  getAuth: () => { getIdToken: () => Promise<string> } | null,
) => {
  try {
    await fetch("/api/transactions/create", {
      method: "POST",
      headers: await getAuthHeaders(getAuth),
      body: JSON.stringify(payload),
    });
  } catch { /* silent */ }
};
