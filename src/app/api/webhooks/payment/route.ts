import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { captureError, captureSecurityEvent } from "@/lib/sentry";

/**
 * Webhook Payment Route — HMAC Signature Verification
 *
 * This endpoint receives payment callbacks from mobile money providers (MTN, Airtel)
 * and credits user accounts upon verified successful payments.
 *
 * Security:
 * - Every request MUST include an `X-Provider-Signature` header (HMAC-SHA256)
 * - The signature is computed over the raw body using PAYMENT_WEBHOOK_SECRET
 * - Timing-safe comparison prevents timing attacks
 * - Duplicate transaction detection prevents double-crediting
 * - Atomic Firestore transaction prevents race conditions on balance updates
 */

// Provider-specific signature headers we accept
const VALID_SIGNATURE_HEADERS = [
  "x-provider-signature",
  "x-mtn-signature",
  "x-airtel-signature",
  "x-paystack-signature",
] as const;

function getSignature(req: NextRequest): string | null {
  for (const header of VALID_SIGNATURE_HEADERS) {
    const sig = req.headers.get(header);
    if (sig) return sig;
  }
  return null;
}

/**
 * Timing-safe HMAC comparison to prevent timing attacks.
 * Returns true if the signatures match, false otherwise.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Verify webhook secret is configured ──
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    captureError(new Error("PAYMENT_WEBHOOK_SECRET not configured"), {
      action: "webhook:payment",
      route: "/api/webhooks/payment",
    });
    return NextResponse.json(
      { error: "Webhook non configuré" },
      { status: 503 }
    );
  }

  // ── 2. Extract and verify HMAC signature ──
  const signature = getSignature(req);
  if (!signature) {
    captureSecurityEvent("webhook_missing_signature", {
      details: { ip: req.headers.get("x-forwarded-for") || "unknown" },
    });
    return NextResponse.json(
      { error: "Signature manquante" },
      { status: 401 }
    );
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Compute expected HMAC-SHA256
  const expectedHash = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (!safeCompare(signature, expectedHash)) {
    captureSecurityEvent("webhook_invalid_signature", {
      details: {
        providedSig: signature.slice(0, 8) + "...",
        expectedSig: expectedHash.slice(0, 8) + "...",
        bodyLength: rawBody.length,
      },
    });
    return NextResponse.json(
      { error: "Tentative de fraude détectée — signature invalide" },
      { status: 401 }
    );
  }

  // ── 3. Parse and validate payload ──
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Payload invalide" },
      { status: 400 }
    );
  }

  const {
    userId,
    moraliId,
    amount,
    reference,
    provider,
    status,
    currency,
    phone,
  } = payload as {
    userId?: string;
    moraliId?: string;
    amount?: number;
    reference?: string;
    provider?: string;
    status?: string;
    currency?: string;
    phone?: string;
  };

  // Validate required fields
  if (!userId || !moraliId || !amount || !reference || !provider || !status) {
    return NextResponse.json(
      {
        error: "Champs requis manquants",
        required: ["userId", "moraliId", "amount", "reference", "provider", "status"],
      },
      { status: 400 }
    );
  }

  // Only process successful payments
  if (status !== "success" && status !== "completed") {
    return NextResponse.json({ received: true, processed: false, reason: "payment_not_successful" });
  }

  // Validate amount is a positive number
  if (typeof amount !== "number" || amount <= 0 || !Number.isFinite(amount)) {
    captureSecurityEvent("webhook_invalid_amount", {
      details: { userId, amount, reference },
    });
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  // ── 4. Process with atomic Firestore transaction ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    // Duplicate detection + atomic balance credit in a single transaction
    const result = await adminDb.runTransaction(async (transaction) => {
      // Check for duplicate by reference
      const existingRef = adminDb.collection("webhookPayments").doc(reference);
      const existingDoc = await transaction.get(existingRef);

      if (existingDoc.exists) {
        return { duplicate: true, existingStatus: existingDoc.data()?.status };
      }

      // Read user document for balance update
      const userRef = adminDb.collection("moraliUsers").doc(String(userId));
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        return { error: "Utilisateur introuvable" };
      }

      const currentBalance = Number(userDoc.data()?.balance) || 0;

      // Credit the user balance
      transaction.update(userRef, {
        balance: currentBalance + amount,
        updatedAt: new Date(),
      });

      // Create webhook payment record
      transaction.set(existingRef, {
        userId: String(userId),
        moraliId: String(moraliId),
        amount: Number(amount),
        currency: String(currency || "XAF"),
        reference: String(reference),
        provider: String(provider),
        phone: phone ? String(phone) : null,
        status: "success",
        processedAt: new Date(),
        rawPayload: payload,
      });

      return {
        success: true,
        newBalance: currentBalance + amount,
        previousBalance: currentBalance,
      };
    });

    if (result.duplicate) {
      return NextResponse.json({
        received: true,
        processed: false,
        duplicate: true,
        existingStatus: result.existingStatus,
      });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      received: true,
      processed: true,
      credited: result.newBalance - result.previousBalance,
      newBalance: result.newBalance,
      reference,
    });
  } catch (err) {
    captureError(err, {
      action: "webhook:payment",
      route: "/api/webhooks/payment",
      extra: { userId, amount, reference, provider },
    });
    return NextResponse.json(
      { error: "Erreur de traitement" },
      { status: 500 }
    );
  }
}

/**
 * GET — Health check for the webhook endpoint.
 * Used by monitoring tools to verify the endpoint is responsive.
 */
export async function GET() {
  const isConfigured = !!process.env.PAYMENT_WEBHOOK_SECRET;
  return NextResponse.json({
    status: "active",
    hmacEnabled: isConfigured,
    supportedProviders: ["mtn", "airtel", "paystack"],
  });
}
