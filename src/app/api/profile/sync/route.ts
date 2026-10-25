import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * POST /api/profile/sync
 * Writes allow-listed profile fields only. Balance, role and wallets are never accepted.
 */

const STRING_FIELDS: Record<string, number> = {
  fullName: 100,
  firstName: 50,
  lastName: 50,
  pseudo: 40,
  phone: 30,
  email: 120,
  address: 200,
  city: 80,
  country: 80,
  bio: 500,
  moraliId: 32,
  moraliIdNormalized: 32,
  rib: 64,
  passwordHint: 16,
};

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().slice(0, max);
  return trimmed;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "profile:sync", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  let body: { profile?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const profile = body.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return NextResponse.json({ error: "Profil invalide" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { uid: auth.uid, updatedAt: new Date() };

  for (const [key, max] of Object.entries(STRING_FIELDS)) {
    if (!(key in profile)) continue;
    if (key === "passwordHint" && profile[key] !== "set") continue;
    const cleaned = cleanString(profile[key], max);
    if (cleaned !== null && cleaned.length > 0) patch[key] = cleaned;
  }

  if ("tontineGroups" in profile) {
    const raw = profile.tontineGroups;
    const encoded = JSON.stringify(raw ?? null);
    if (Array.isArray(raw) && raw.length <= 40 && encoded.length <= 80_000) {
      patch.tontineGroups = JSON.parse(encoded);
    }
  }

  const ref = adminDb.collection("moraliUsers").doc(auth.uid);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      patch.createdAt = new Date();
      patch.balance = 0;
      patch.savingsBalance = 0;
      patch.eurWallet = 0;
      patch.usdWallet = 0;
      patch.accountStatus = "active";
      tx.set(ref, patch);
      return;
    }
    const existing = snap.data() || {};
    if (!existing.createdAt) patch.createdAt = new Date();
    tx.set(ref, patch, { merge: true });
  });

  return NextResponse.json({ success: true });
}
