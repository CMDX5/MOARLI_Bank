import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { z } from "zod/v4";

/**
 * POST /api/revenue/track
 *
 * Records a bank revenue entry. Called client-side after fee-generating operations.
 * Only authenticated users can create revenue entries.
 */

const schema = z.object({
  type: z.enum([
    "withdrawal_fee",
    "service_fee",
    "exchange_fee",
    "account_maintenance",
    "transfer_fee",
    "tontine_commission",
    "microcredit_interest",
    "black_card_fee",
    "savings_interest_diff",
    "other",
  ]),
  amount: z.number().min(0),
  referenceId: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "revenue:track", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { type, amount, referenceId, description } = parsed.data;
    if (amount <= 0) {
      return NextResponse.json({ error: "Montant doit être positif" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ success: false, fallback: true });
    }

    // Get user name from Firestore
    let sourceName = "Utilisateur";
    try {
      const userDoc = await adminDb.collection("moraliUsers").doc(auth.uid).get();
      if (userDoc.exists) {
        sourceName = userDoc.data()?.fullName || userDoc.data()?.name || "Utilisateur";
      }
    } catch { /* ignore */ }

    await adminDb.collection("bankRevenue").add({
      type,
      amount: Math.round(amount),
      sourceUid: auth.uid,
      sourceName,
      referenceId: referenceId || null,
      description: description || `${type} — ${amount} FCFA`,
      currency: "FCFA",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[revenue:track] Error:", err);
    return NextResponse.json({ success: false, fallback: true });
  }
}
