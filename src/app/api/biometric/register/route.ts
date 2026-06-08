import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/biometric/register
 * Sauvegarde le credentialId WebAuthn après enregistrement réussi.
 * Body: { credentialId: string (base64url), publicKey: string (base64url) }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const uid = auth.uid;

  try {
    const { credentialId, publicKey } = await req.json();
    if (!credentialId || typeof credentialId !== "string") {
      return NextResponse.json({ error: "credentialId requis" }, { status: 400 });
    }

    const db = await getAdminFirestore();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    // Vérifier que le challenge n'a pas expiré
    const challengeDoc = await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricChallenge")
      .get();

    if (!challengeDoc.exists) {
      return NextResponse.json({ error: "Challenge introuvable" }, { status: 400 });
    }
    const { expiresAt } = challengeDoc.data()!;
    if (Date.now() > expiresAt) {
      return NextResponse.json({ error: "Challenge expiré" }, { status: 400 });
    }

    // Sauvegarder le credential
    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricCredential")
      .set({
        credentialId,
        publicKey: publicKey || null,
        registeredAt: FieldValue.serverTimestamp(),
        platform: "webauthn",
      });

    // Activer faceId dans securitySettings
    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("securitySettings")
      .set({ faceId: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Supprimer le challenge utilisé
    await challengeDoc.ref.delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Biometric register error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/biometric/register
 * Supprime le credential et désactive faceId
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const uid = auth.uid;

  try {
    const db = await getAdminFirestore();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("biometricCredential")
      .delete();

    await db
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("securitySettings")
      .set({ faceId: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Biometric delete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
