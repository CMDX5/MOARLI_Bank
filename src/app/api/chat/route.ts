import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Chat Support API — IDOR-PROTECTED
 *
 * - GET: Load chat history (paginated, latest 50)
 * - POST: Send message + trigger auto-reply after 1-2s delay
 *
 * Firestore path: chats/{uid}/messages
 */

const AUTO_REPLIES: Record<string, string> = {
  "Problème de transaction":
    "Je comprends votre frustration. Pouvez-vous me préciser le numéro de transaction ou la date ? Je vais vérifier immédiatement le statut dans notre système.",
  "Carte bloquée":
    "Votre carte semble être gelée. Rendez-vous dans la section \"Cartes\" de votre espace pour la réactiver. Si le problème persiste, je peux lancer une vérification manuelle.",
  "Question tarif":
    "Voici nos tarifs actuels :\n• Transfert national : 0.5%\n• Retrait cash : 1%\n• Crédit téléphone : 0 FCFA\n• Change devises : Spread de 2%\n\nY a-t-il un service spécifique qui vous intéresse ?",
};

const SUPPORT_REPLIES = [
  "Merci pour votre message. Un de nos conseillers va vous répondre sous peu. En attendant, n'hésitez pas à consulter notre FAQ dans les paramètres.",
  "Votre demande a bien été prise en compte. Notre équipe technique examine votre cas et reviendra vers vous rapidement.",
  "Je note votre préoccupation. Pour un traitement plus rapide, vous pouvez également nous contacter par email à support@morali-pay.com.",
  "Bien reçu ! Je transmets votre demande au service compétent. Le délai de réponse est généralement de 5 à 10 minutes.",
];

function getRandomReply(): string {
  return SUPPORT_REPLIES[Math.floor(Math.random() * SUPPORT_REPLIES.length)];
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "chat:history", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    const snap = await adminDb
      .collection("chats")
      .doc(auth.uid)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limit(50)
      .get();

    const messages = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    // Count unread support messages
    const unread = messages.filter(
      (m) => (m as Record<string, unknown>).sender === "support" && !(m as Record<string, unknown>).read
    ).length;

    return NextResponse.json({ success: true, messages, unread });
  } catch (err) {
    console.error("[chat] GET error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "chat:send", { maxRequests: 15, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Message vide" }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: "Message trop long (max 500 caractères)" }, { status: 400 });
    }

    const sanitized = text.trim().replace(/<[^>]*>/g, "").slice(0, 500);

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    // Save user message
    await adminDb.collection("chats").doc(auth.uid).collection("messages").add({
      sender: "user",
      text: sanitized,
      timestamp: new Date(),
      read: true,
    });

    // Determine auto-reply
    const replyText = AUTO_REPLIES[sanitized] || getRandomReply();

    // Schedule auto-reply (fire-and-forget with 1-2s delay)
    const delay = 1000 + Math.random() * 1000;
    const uid = auth.uid;
    setTimeout(async () => {
      try {
        await adminDb.collection("chats").doc(uid!).collection("messages").add({
          sender: "support",
          text: replyText,
          timestamp: new Date(),
          read: false,
        });
      } catch (err) {
        console.error("[chat] auto-reply error:", err);
      }
    }, delay).unref();

    return NextResponse.json({
      success: true,
      message: "Message envoyé",
      autoReplyScheduled: true,
    });
  } catch (err) {
    console.error("[chat] POST error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
