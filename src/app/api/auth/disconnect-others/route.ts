import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/auth/disconnect-others
 *
 * Déconnecte tous les autres appareils en générant un nouveau sessionToken.
 * Le client courant reçoit le nouveau token et continue de fonctionner.
 * Les autres clients avec l'ancien token seront déconnectés au prochain refresh.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error || !auth.uid) return auth.error ?? NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const db = await getAdminFirestore();
    if (!db) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    const uid = auth.uid;

    // Générer un nouveau session token unique
    const sessionToken = crypto.randomUUID();

    // Sauvegarder dans Firestore
    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("sessionToken")
      .set({
        token: sessionToken,
        updatedAt: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({ success: true, sessionToken });
  } catch (err) {
    console.error("Disconnect others error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
