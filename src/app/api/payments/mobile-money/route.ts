import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Mobile Money Payment API
 * TODO: Integrate with MTN Mobile Money API (MoMo API v2) and/or Airtel Money
 * Required API credentials: MTN MoMo Primary Key, User ID, API Secret
 * Documentation: https://momodeveloper.mtn.com/
 *
 * Request body expected:
 * - amount: number (in FCFA)
 * - phone: string (recipient phone number)
 * - currency: string (default: "XAF")
 * - provider: "mtn_momo" | "airtel_money"
 * - description: string
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { amount, phone, currency = "XAF", provider, description } = body;

    // Validate inputs
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: "Montant invalide" }, { status: 400 });
    }
    if (!phone || !/^\+?\d{10,15}$/.test(phone)) {
      return NextResponse.json({ success: false, error: "Numéro de téléphone invalide" }, { status: 400 });
    }
    if (!["mtn_momo", "airtel_money"].includes(provider)) {
      return NextResponse.json({ success: false, error: "Opérateur non supporté" }, { status: 400 });
    }

    // TODO: Implement real Mobile Money API call
    // 1. Create API user token via /v1_0/apiuser/{userId}/apikey
    // 2. Get access token via /collection/token/
    // 3. Initiate payment via /collection/v1_0/requesttopay
    // 4. Poll payment status via /collection/v1_0/requesttopay/{referenceId}

    return NextResponse.json({
      success: false,
      error: "Service Mobile Money non encore disponible. Prochainement.",
      referenceId: `MM_${Date.now()}`,
    }, { status: 503 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Non autorisé" }, { status: error.status || 500 });
  }
}
