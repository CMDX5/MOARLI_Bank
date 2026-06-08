import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * POST /api/biometric/verify
 * Vérifie qu'un credential WebAuthn correspond à celui enregistré.
 * Body: { credentialId: string (base64url) }
 * Retourne { valid: true } si le credentialId correspond au credential enregistré.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  const uid = auth.uid;

  try {
    const { credentialId } = await req.json();
    if (!credentialId || typeof credentialId !== "string") {
      return NextResponse.json({ valid: false, error: "credentialId requis" }, { status: 400 });
    }

    const db = await getAdminFirestore();
    if (!db) return NextResponse.json({ valid: false, error: "DB unavailable" }, { status: 503 });

    // Vérifier challenge non expiré
    const challengeDoc = await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricChallenge")
      .get();

    if (!challengeDoc.exists) {
      return NextResponse.json({ valid: false, error: "Challenge introuvable" }, { status: 400 });
    }
    const { expiresAt } = challengeDoc.data()!;
    if (Date.now() > expiresAt) {
      return NextResponse.json({ valid: false, error: "Challenge expiré" }, { status: 400 });
    }

    // Récupérer le credential enregistré
    const credDoc = await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricCredential")
      .get();

    if (!credDoc.exists) {
      return NextResponse.json({ valid: false, error: "Aucun credential enregistré" }, { status: 400 });
    }

    const stored = credDoc.data()!;

    // Comparer les credentialId
    const isValid = stored.credentialId === credentialId;

    // Supprimer le challenge utilisé (one-time use)
    await challengeDoc.ref.delete();

    if (!isValid) {
      return NextResponse.json({ valid: false, error: "Credential non reconnu" });
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    console.error("Biometric verify error:", err);
    return NextResponse.json({ valid: false, error: "Internal error" }, { status: 500 });
  }
}
