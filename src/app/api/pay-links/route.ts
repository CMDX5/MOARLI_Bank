import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Pay Links API — IDOR-PROTECTED
 *
 * - GET: List all pay links for the authenticated user
 * - POST: Create a new pay link
 * - PATCH: Toggle active status, update amounts
 * - DELETE: Delete a pay link
 *
 * Firestore path: users/{uid}/paylinks/{linkId}
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "paylinks:list", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    const snap = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("paylinks")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const links = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ success: true, links });
  } catch (err) {
    console.error("[pay-links] GET error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "paylinks:create", { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const { amount, description, currency } = body;

    // Validate
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    if (amount > 10_000_000) {
      return NextResponse.json({ error: "Montant maximum : 10 000 000" }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json({ error: "Description requise" }, { status: 400 });
    }
    if (description.length > 80) {
      return NextResponse.json({ error: "Description trop longue (max 80 caractères)" }, { status: 400 });
    }

    const cur = (currency || "XAF").toUpperCase().slice(0, 3);
    const allowedCurrencies = ["XAF", "EUR", "USD"];
    if (!allowedCurrencies.includes(cur)) {
      return NextResponse.json({ error: "Devise non supportée" }, { status: 400 });
    }

    // Generate short code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let shortCode = "MR-";
    for (let i = 0; i < 4; i++) shortCode += chars[Math.floor(Math.random() * chars.length)];

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    const linkRef = await adminDb.collection("users").doc(auth.uid).collection("paylinks").add({
      amount: Math.round(amount),
      currency: cur,
      description: description.trim(),
      shortCode,
      active: true,
      totalPaid: 0,
      payerCount: 0,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      linkId: linkRef.id,
      shortCode,
      message: "Lien de paiement créé avec succès",
    });
  } catch (err) {
    console.error("[pay-links] POST error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "paylinks:update", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const { linkId, action, amount, description } = body;

    if (!linkId || typeof linkId !== "string") {
      return NextResponse.json({ error: "linkId requis" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    // Verify ownership
    const linkDoc = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("paylinks")
      .doc(linkId)
      .get();

    if (!linkDoc.exists) {
      return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (action === "toggle") {
      updateData.active = !linkDoc.data()?.active;
    } else if (action === "updateAmount" && typeof amount === "number" && amount > 0) {
      if (amount > 10_000_000) {
        return NextResponse.json({ error: "Montant maximum : 10 000 000" }, { status: 400 });
      }
      updateData.amount = Math.round(amount);
    } else if (action === "updateDescription" && typeof description === "string" && description.trim().length > 0) {
      if (description.length > 80) {
        return NextResponse.json({ error: "Description trop longue" }, { status: 400 });
      }
      updateData.description = description.trim();
    } else {
      return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
    }

    await linkDoc.ref.update(updateData);

    return NextResponse.json({
      success: true,
      linkId,
      ...updateData,
      message: "Lien mis à jour",
    });
  } catch (err) {
    console.error("[pay-links] PATCH error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "paylinks:delete", { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json({ error: "linkId requis" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    // Verify ownership
    const linkDoc = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("paylinks")
      .doc(linkId)
      .get();

    if (!linkDoc.exists) {
      return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    }

    await linkDoc.ref.delete();

    return NextResponse.json({ success: true, message: "Lien supprimé" });
  } catch (err) {
    console.error("[pay-links] DELETE error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
