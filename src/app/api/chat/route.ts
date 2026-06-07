import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import ZAI from "z-ai-web-dev-sdk";

/**
 * Chat Support API — IDOR-PROTECTED with LLM-powered responses
 *
 * - GET: Load chat history (paginated, latest 50)
 * - POST: Send message + LLM auto-reply
 *
 * Firestore path: chats/{uid}/messages
 */

const SYSTEM_PROMPT = `Tu es le conseiller virtuel de MOARLI Bank, une application bancaire mobile. Tu es professionnel, courtois, et tu dialogues naturellement en français.

Règles strictes :
1. Réponds TOUJOURS en français
2. Tu ne parles QUE de MOARLI Bank et de ses services bancaires : virements, retraits, dépôts, change de devises, épargne, prêts, cartes bancaires, crédits téléphone/internet, tontines, crypto, portefeuilles multi-devises
3. Si l'utilisateur parle de sujets hors bancaire, redirige poliment vers les services MOARLI
4. Tu dialogues librement et naturellement : salutations, politesses, empathie, tout en restant professionnel
5. Réponds de façon concise (max 2-3 phrases) sauf si l'utilisateur pose une question détaillée
6. Utilise un ton chaleureux mais professionnel, comme un bon banquier
7. Pour les salutations (bonjour, bonsoir, salut, coucou, bienvenue), réponds naturellement par la même salutation suivie d'une proposition d'aide
8. Si on te demande comment tu vas, réponds brièvement et propose ton aide
9. Ne donne JAMAIS d'informations personnelles, ne simule JAMAIS des opérations bancaires réelles
10. Pour toute demande technique (problème de transaction, carte bloquée), oriente l'utilisateur vers la section appropriée de l'app`;

// In-memory conversation history per user (last 10 messages for context)
const userConversations = new Map<string, { role: string; content: string }[]>();

function getConversationHistory(uid: string): { role: string; content: string }[] {
  if (!userConversations.has(uid)) {
    userConversations.set(uid, []);
  }
  return userConversations.get(uid)!;
}

function addToHistory(uid: string, role: string, content: string) {
  const history = getConversationHistory(uid);
  history.push({ role, content });
  // Keep last 10 messages only (5 user + 5 assistant)
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
}

async function getLLMResponse(uid: string, userMessage: string): Promise<string> {
  const history = getConversationHistory(uid);

  try {
    const zai = await ZAI.create();

    const messages = [
      { role: "assistant", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userMessage },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const response = completion.choices[0]?.message?.content;

    if (!response || response.trim().length === 0) {
      return "Je vous remercie pour votre message. Comment puis-je vous aider avec vos services bancaires MOARLI ?";
    }

    return response.trim().slice(0, 500);
  } catch (err) {
    console.error("[chat] LLM error:", err);
    return "Une interruption technique est survenue. Je suis toujours là pour vous aider avec vos services MOARLI. Que puis-je faire pour vous ?";
  }
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

    // Add to conversation history for LLM context
    addToHistory(auth.uid, "user", sanitized);

    // Get LLM reply
    const replyText = await getLLMResponse(auth.uid, sanitized);

    // Add reply to conversation history
    addToHistory(auth.uid, "assistant", replyText);

    // Save support reply with a small delay for natural feel
    const delay = 800 + Math.random() * 700;
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
        console.error("[chat] LLM reply save error:", err);
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
