import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { getAdminAuth } from "@/lib/auth-verify";

/**
 * One-time API to create a test Morali account.
 * Should be deleted after use.
 */
export async function POST(req: NextRequest) {
  try {
    const adminDb = await getAdminFirestore();
    const adminAuth = await getAdminAuth();
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const email = "test.zai.code@gmail.com";
    const password = "MoraliTest@2024!";
    const displayName = "Z AI Test";

    // Check if user already exists
    let uid: string;
    try {
      const userRecord = await adminAuth.createUser({
        email,
        password,
        displayName,
      });
      uid = userRecord.uid;
    } catch (err: unknown) {
      const code = (err as { errorInfo?: { code: string } }).errorInfo?.code || "";
      if (code === "auth/email-already-exists") {
        const listResult = await adminAuth.getUsers([{ email }]);
        if (listResult.users.length > 0) {
          uid = listResult.users[0].uid;
        } else {
          return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Erreur création compte" }, { status: 500 });
      }
    }

    // Check existing doc
    const existingDoc = await adminDb.doc(`moraliUsers/${uid}`).get();

    // Generate moraliId deterministically
    const seed = email.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash * 1099511628) + seed.charCodeAt(i)) % 900000000;
    }
    const suffix = String(hash + 1).padStart(9, "0").slice(-9);
    const moraliId = `MORALI${suffix.slice(0, 5)}`;
    const rib = `MOKG-242-2028-${suffix.slice(0, 4)}`;

    if (!existingDoc.exists) {
      // Create full profile
      await adminDb.doc(`moraliUsers/${uid}`).set({
        uid,
        fullName: displayName,
        firstName: "Z AI",
        lastName: "Test",
        pseudo: "@zaicode",
        moraliId,
        moraliIdNormalized: moraliId,
        rib,
        phone: "",
        email,
        balance: 50000,
        savingsBalance: 0,
        eurWallet: 0,
        usdWallet: 0,
        accountStatus: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create directory lookup
      await adminDb.doc(`directoryLookup/morali_${moraliId}`).set({
        uid,
        moraliId,
        fullName: displayName,
        pseudo: "zaicode",
      });

      await adminDb.doc(`directoryLookup/pseudo_zaicode`).set({
        uid,
        moraliId,
        fullName: displayName,
        pseudo: "zaicode",
      });

      return NextResponse.json({
        success: true,
        created: true,
        uid,
        moraliId,
        rib,
        email,
        password,
        balance: 50000,
      });
    }

    const data = existingDoc.data()!;
    // Update directory lookup if missing
    if (data.moraliId) {
      await adminDb.doc(`directoryLookup/morali_${data.moraliId}`).set({
        uid,
        moraliId: data.moraliId,
        fullName: data.fullName || displayName,
        pseudo: (data.pseudo || "zaicode").replace("@", ""),
      }, { merge: true });
    }

    return NextResponse.json({
      success: true,
      created: false,
      uid,
      moraliId: data.moraliId || moraliId,
      rib: data.rib || rib,
      email,
      balance: data.balance || 0,
    });
  } catch (err) {
    console.error("[create-test-user] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
