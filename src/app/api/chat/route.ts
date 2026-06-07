import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

// Ensure .z-ai-config exists for z-ai-web-dev-sdk (required at runtime)
// On Vercel: reads from env vars. On local: falls back to /etc/.z-ai-config or project file.
(function ensureZAIConfig() {
  const configPath = path.join(process.cwd(), ".z-ai-config");
  if (!fs.existsSync(configPath)) {
    const config = {
      baseUrl: process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1",
      apiKey: process.env.ZAI_API_KEY || "Z.ai",
      chatId: process.env.ZAI_CHAT_ID || "chat-01dfd386-2ed2-451a-88a6-af7660da4c2b",
      userId: process.env.ZAI_USER_ID || "d524f435-033c-468e-80ec-904f9cf4c90a",
      token: process.env.ZAI_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZDUyNGY0MzUtMDMzYy00NjhlLTgwZWMtOTA0ZjljZjRjOTBhIiwiY2hhdF9pZCI6ImNoYXQtMDFkZmQzODYtMmVkMi00NTFhLTg4YTYtYWY3NjYwZGE0YzJiIiwicGxhdGZvcm0iOiJ6YWkifQ.RCNwzYJkfsWGdTN_KlU_iBEI9fBLamxB3Hp0iut7_gA",
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
  }
})();

/**
 * Chat Support API — IDOR-PROTECTED with LLM/VLM-powered responses
 *
 * - GET: Load chat history (paginated, latest 50)
 * - POST: Send message (+ optional image) + LLM/VLM auto-reply
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

const IMAGE_SYSTEM_PROMPT = `Tu es le conseiller virtuel de MOARLI Bank. L'utilisateur vient d'envoyer une image dans le chat de support. Analyse l'image avec attention et réponds de manière utile.

Règles :
1. Si l'image montre un reçu, une facture, un ticket de transaction — identifie les informations bancaires pertinentes
2. Si l'image montre un problème technique (screenshot d'erreur) — aide à résoudre le problème
3. Si l'image montre un document d'identité — confirme la réception et explique les prochaines étapes pour la vérification KYC
4. Si l'image n'est pas pertinente pour les services bancaires MOARLI — redirige poliment
5. Réponds TOUJOURS en français, de façon concise et professionnelle
6. Si tu ne peux pas identifier clairement l'image, demande des précisions`;

// In-memory conversation history per user (last 10 messages for context)
type MsgRole = "user" | "assistant";
const userConversations = new Map<string, { role: MsgRole; content: string }[]>();

function getConversationHistory(uid: string): { role: MsgRole; content: string }[] {
  if (!userConversations.has(uid)) {
    userConversations.set(uid, []);
  }
  return userConversations.get(uid)!;
}

function addToHistory(uid: string, role: MsgRole, content: string) {
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
      { role: "assistant" as const, content: SYSTEM_PROMPT },
      ...history,
      { role: "user" as const, content: userMessage },
    ];

    const completion = await zai.chat.completions.create({
      messages: messages as any,
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

async function getVLMResponse(uid: string, userMessage: string, imageUrl: string): Promise<string> {
  try {
    const zai = await ZAI.create();

    const prompt = userMessage && userMessage !== "📷 Image"
      ? userMessage
      : "Analysez cette image envoyée dans le chat de support MOARLI Bank et aidez l'utilisateur.";

    const response = await zai.chat.completions.createVision({
      model: "glm-4.6v",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_SYSTEM_PROMPT },
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as any);

    const reply = response.choices[0]?.message?.content;

    if (!reply || reply.trim().length === 0) {
      return "J'ai bien reçu votre image. Pourriez-vous me préciser ce que vous souhaitez concernant cette image ? Je suis là pour vous aider avec vos services MOARLI.";
    }

    return reply.trim().slice(0, 500);
  } catch (err) {
    console.error("[chat] VLM error:", err);
    return "J'ai bien reçu votre image. Pourriez-vous me décrire ce qu'elle montre et comment je peux vous aider avec vos services bancaires MOARLI ?";
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
    const { text, imageUrl } = body as { text?: string; imageUrl?: string };

    if ((!text || typeof text !== "string" || text.trim().length === 0) && !imageUrl) {
      return NextResponse.json({ error: "Message vide" }, { status: 400 });
    }

    const sanitized = (text || "").trim().replace(/<[^>]*>/g, "").slice(0, 500);
    const msgText = sanitized || (imageUrl ? "📷 Image" : "");

    // Validate imageUrl if provided
    let safeImageUrl: string | undefined;
    if (imageUrl) {
      if (typeof imageUrl !== "string" || !imageUrl.startsWith("data:image/")) {
        return NextResponse.json({ error: "Format d'image invalide" }, { status: 400 });
      }
      // Limit base64 size (~1.5MB max in Firestore)
      if (imageUrl.length > 1_500_000) {
        return NextResponse.json({ error: "Image trop volumineuse" }, { status: 400 });
      }
      safeImageUrl = imageUrl;
    }

    if (msgText.length > 500) {
      return NextResponse.json({ error: "Message trop long (max 500 caractères)" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    // Save user message
    const userMsgData: Record<string, unknown> = {
      sender: "user",
      text: msgText,
      timestamp: new Date(),
      read: true,
    };
    if (safeImageUrl) {
      userMsgData.imageUrl = safeImageUrl;
    }
    await adminDb.collection("chats").doc(auth.uid).collection("messages").add(userMsgData);

    // Add to conversation history for LLM context (text only, no base64)
    addToHistory(auth.uid, "user" as MsgRole, msgText);

    // Get LLM or VLM reply
    const replyText = safeImageUrl
      ? await getVLMResponse(auth.uid, msgText, safeImageUrl)
      : await getLLMResponse(auth.uid, msgText);

    // Add reply to conversation history
    addToHistory(auth.uid, "assistant" as MsgRole, replyText);

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
