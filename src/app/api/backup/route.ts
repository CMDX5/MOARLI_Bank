import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";

/**
 * GET /api/backup — Returns backup status (Firestore-based).
 * NOTE: SQLite backup has been removed. Firestore data is managed by Firebase.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  return NextResponse.json({
    database: { type: "firestore", status: "active" },
    backups: "managed_by_firebase",
    message: "Les données sont stockées dans Firebase Firestore. Utilisez Firebase Console pour les exports.",
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  return NextResponse.json({
    success: false,
    message: "Sauvegarde SQLite désactivée. Utilisez Firebase Console pour exporter les données Firestore.",
  });
}
