import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * TEMPORARY: Admin Init Role API
 *
 * Sets the Firestore role field for the authenticated user.
 * This is a one-time setup endpoint that will be removed after use.
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

    const userRef = adminDb.collection("moraliUsers").doc(auth.uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const data = userSnap.data()!;
      if (data.role === "admin") {
        return NextResponse.json({
          success: true,
          message: "Rôle admin déjà configuré",
        });
      }
      await userRef.update({
        role: "admin",
        roleLevel: "full",
        isAdmin: true,
        updatedAt: new Date(),
      });
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

    return NextResponse.json({
      success: true,
      message: "Rôle admin configuré avec succès",
      uid: auth.uid,
    });
  } catch (err) {
    console.error("[admin:init-role] Error:", err);
    return NextResponse.json(
      { error: "Erreur interne" },
      { status: 500 }
    );
  }
}
