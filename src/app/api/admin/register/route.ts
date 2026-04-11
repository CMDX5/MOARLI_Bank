import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

/**
 * Admin Register API
 *
 * Creates the first admin account:
 * 1. Creates Firebase Auth user via admin SDK
 * 2. Sets custom claim { role: "admin" }
 * 3. Creates Firestore doc config/adminExists
 * 4. Creates user profile in users/{uid}
 *
 * Security:
 * - Only works if NO admin exists yet (config/adminExists must not exist)
 * - Rate limited: 3 req/min (prevent brute force)
 * - Password min 8 chars
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`admin:register:${clientId}`, { maxRequests: 3, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service de base de données indisponible" },
        { status: 503 }
      );
    }

    // ── Check if admin already exists ──
    const configRef = adminDb.doc("config/adminExists");
    const configSnap = await configRef.get();
    if (configSnap.exists) {
      return NextResponse.json(
        { error: "Un administrateur existe déjà. Utilisez la connexion." },
        { status: 403 }
      );
    }

    // ── Parse request body ──
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }
    if (!email.includes("@")) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Mot de passe trop court (8 caractères min)" }, { status: 400 });
    }

    // ── Create admin user via Firebase Admin Auth ──
    const { getAuth } = await import("firebase-admin/auth");
    const adminAuth = getAuth();

    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: email.trim().toLowerCase(),
        password,
        displayName: name || "Admin Morali Pay",
      });
    } catch (err: unknown) {
      const code = err instanceof Error ? (err as { errorInfo?: { code: string } }).errorInfo?.code || "" : "";
      if (code === "auth/email-already-exists") {
        return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
      }
      return NextResponse.json({ error: "Erreur lors de la création du compte" }, { status: 500 });
    }

    // ── Set custom claim ──
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: "admin" });

    // ── Mark admin as existing in Firestore ──
    await configRef.set({
      adminEmail: email.trim().toLowerCase(),
      adminUid: userRecord.uid,
      adminName: name || "Admin Morali Pay",
      createdAt: new Date().toISOString(),
    });

    // ── Create user profile ──
    await adminDb.doc(`users/${userRecord.uid}`).set({
      email: email.trim().toLowerCase(),
      fullName: name || "Admin Morali Pay",
      role: "admin",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Compte administrateur créé avec succès",
      uid: userRecord.uid,
    });
  } catch (err) {
    console.error("[admin/register] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
