import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/biometric/challenge
 * Génère un challenge aléatoire côté serveur pour WebAuthn.
 * Le challenge est stocké temporairement (5 min) dans Firestore
 * pour être vérifié lors du register ou verify.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const uid = auth.uid;

  try {
    const db = await getAdminFirestore();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    // Générer 32 bytes aléatoires
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);
    const challengeB64 = Buffer.from(challengeBytes).toString("base64url");

    // Sauvegarder le challenge avec expiry 5 minutes
    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricChallenge")
      .set({
        challenge: challengeB64,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

    return NextResponse.json({ challenge: challengeB64 });
  } catch (err) {
    console.error("Biometric challenge error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
