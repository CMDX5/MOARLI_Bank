import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { setAdminClaim } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * Admin Init Role API
 *
 * Sets both Firestore role field AND Firebase custom claims for the authenticated user.
 * This ensures admin access works across all API routes (claims-based + Firestore fallback).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service indisponible" },
        { status: 503 }
      );
    }

    // ── 1. Set Firestore role ──
    const userRef = adminDb.collection("moraliUsers").doc(auth.uid);
    const userSnap = await userRef.get();
    let wasAlreadyAdmin = false;

    if (userSnap.exists) {
      const data = userSnap.data()!;
      if (data.role === "admin") {
        wasAlreadyAdmin = true;
      } else {
        await userRef.update({
          role: "admin",
          roleLevel: "full",
          isAdmin: true,
          updatedAt: new Date(),
        });
      }
    } else {
      await userRef.set({
        uid: auth.uid,
        email: "",
        fullName: "Administrateur",
        role: "admin",
        roleLevel: "full",
        isAdmin: true,
        balance: 0,
        savingsAmount: 0,
        totalSent: 0,
        totalReceived: 0,
        accountStatus: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // ── 2. Set Firebase custom claims (authoritative for API auth) ──
    const claimsSet = await setAdminClaim(auth.uid, "full");

    return NextResponse.json({
      success: true,
      message: claimsSet
        ? "Rôle admin configuré avec succès (Firestore + Custom Claims)"
        : "Rôle Firestore configuré — Custom Claims en attente",
      uid: auth.uid,
      claimsSet,
    });
  } catch (err) {
    console.error("[admin:init-role] Error:", err);
    return NextResponse.json(
      { error: "Erreur interne" },
      { status: 500 }
    );
  }
}
