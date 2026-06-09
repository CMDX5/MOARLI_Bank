import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/auth-verify";

/**
 * Reset password for test account
 */
export async function POST(req: NextRequest) {
  try {
    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const { email, newPassword } = await req.json();
    if (!email || !newPassword) {
      return NextResponse.json({ error: "Email et nouveau mot de passe requis" }, { status: 400 });
    }

    // Find user by email
    const listResult = await adminAuth.getUsers([{ email }]);
    if (listResult.users.length === 0) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const uid = listResult.users[0].uid;
    await adminAuth.updateUser(uid, { password: newPassword });

    return NextResponse.json({ success: true, message: "Mot de passe mis à jour" });
  } catch (err) {
    console.error("[reset-password] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
