import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Leaderboard API — IDOR-PROTECTED
 *
 * GET  — Fetch leaderboard entries (paginated, top 50)
 * POST — Update user score
 *
 * Firestore paths:
 *   leaderboard/{uid} — user's leaderboard entry
 *   users/{uid}/achievements — user's achievement badges
 */

// ── Default achievements ──
const DEFAULT_ACHIEVEMENTS = [
  { id: "first_saving", name: "Premier Épargne", description: "Effectuez votre premier dépôt d'épargne", icon: "piggy", progress: 0, unlockedAt: null },
  { id: "ten_transactions", name: "10 Transactions", description: "Effectuez 10 transactions", icon: "receipt", progress: 0, unlockedAt: null },
  { id: "goal_reached", name: "Objectif Atteint", description: "Atteignez un objectif d'épargne", icon: "target", progress: 0, unlockedAt: null },
  { id: "tontine_master", name: "Tontine Master", description: "Participez à 3 tontines actives", icon: "users", progress: 0, unlockedAt: null },
  { id: "budget_pro", name: "Budget Pro", description: "Respectez votre budget 3 mois consécutifs", icon: "chart", progress: 0, unlockedAt: null },
  { id: "streak_7", name: "Série de 7 jours", description: "Connectez-vous 7 jours consécutifs", icon: "trending-up", progress: 0, unlockedAt: null },
  { id: "social_star", name: "Étoile Sociale", description: "Invitez 5 amis sur MOARLI", icon: "star", progress: 0, unlockedAt: null },
  { id: "crypto_explorer", name: "Explorateur Crypto", description: "Effectuez votre premier achat crypto", icon: "crypto", progress: 0, unlockedAt: null },
];

// ── Level calculation ──
function calculateLevel(score: number): { level: number; nextScore: number; title: string } {
  const levels = [
    { min: 0, title: "Débutant" },
    { min: 100, title: "Novice" },
    { min: 300, title: "Apprenti" },
    { min: 600, title: "Intermédiaire" },
    { min: 1000, title: "Avancé" },
    { min: 1500, title: "Expert" },
    { min: 2500, title: "Maître" },
    { min: 4000, title: "Champion" },
    { min: 6000, title: "Légende" },
  ];
  let level = 1;
  let title = "Débutant";
  for (let i = levels.length - 1; i >= 0; i--) {
    if (score >= levels[i].min) {
      level = i + 1;
      title = levels[i].title;
      break;
    }
  }
  const nextScore = level < levels.length ? levels[level].min : levels[levels.length - 1].min + 2000;
  return { level, nextScore, title };
}

// ── GET: Fetch leaderboard ──
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "leaderboard:get", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    // Parse query params
    const url = req.nextUrl;
    const tab = url.searchParams.get("tab") || "epargne"; // epargne | transactions | objectifs
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") || "20", 10) || 20));

    // Fetch leaderboard entries ordered by score desc
    const orderByField = tab === "epargne" ? "score" : tab === "transactions" ? "transactionCount" : "goalsReached";
    const leaderSnap = await adminDb
      .collection("leaderboard")
      .orderBy(orderByField, "desc")
      .limit(perPage)
      .get();

    const entries = leaderSnap.docs.map((doc, idx) => {
      const data = doc.data();
      const { level, nextScore, title } = calculateLevel(data.score ?? 0);
      return {
        uid: doc.id,
        name: data.name ?? "Anonyme",
        avatar: data.avatar ?? "",
        score: data.score ?? 0,
        level,
        levelTitle: title,
        nextScore,
        badge: data.badge ?? "",
        streak: data.streak ?? 0,
        transactionCount: data.transactionCount ?? 0,
        goalsReached: data.goalsReached ?? 0,
        savingsTotal: data.savingsTotal ?? 0,
        rank: idx + 1,
        isCurrentUser: doc.id === auth.uid,
      };
    });

    // Fetch current user's achievements
    const achievementsSnap = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("achievements")
      .get();

    const achievements = achievementsSnap.docs.length > 0
      ? achievementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      : DEFAULT_ACHIEVEMENTS;

    // Fetch active challenges
    const challengesSnap = await adminDb
      .collection("challenges")
      .where("active", "==", true)
      .limit(10)
      .get();

    const challenges = challengesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      entries,
      achievements,
      challenges,
      tab,
      page,
      perPage,
    });
  } catch (err) {
    console.error("[leaderboard/get] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// ── POST: Update user score ──
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "leaderboard:post", { maxRequests: 15, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const pointsDelta = Number(body.pointsDelta) || 0;
    const transactionCount = Number(body.transactionCount);
    const goalsReached = Number(body.goalsReached);
    const savingsTotal = Number(body.savingsTotal);
    const streak = Number(body.streak);
    const achievementId = String(body.achievementId || "").trim();

    if (pointsDelta < 0) {
      return NextResponse.json({ error: "Les points ne peuvent pas être négatifs" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const docRef = adminDb.collection("leaderboard").doc(auth.uid);
    const existing = await docRef.get();

    const updateData: Record<string, unknown> = {
      score: (existing.exists ? (existing.data()?.score ?? 0) : 0) + pointsDelta,
      updatedAt: new Date().toISOString(),
    };

    if (!isNaN(transactionCount)) updateData.transactionCount = transactionCount;
    if (!isNaN(goalsReached)) updateData.goalsReached = goalsReached;
    if (!isNaN(savingsTotal)) updateData.savingsTotal = savingsTotal;
    if (!isNaN(streak)) updateData.streak = streak;
    if (body.name) updateData.name = String(body.name).slice(0, 100);
    if (body.avatar) updateData.avatar = String(body.avatar).slice(0, 500);

    await docRef.set(updateData, { merge: true });

    // Unlock achievement if specified
    if (achievementId) {
      const achRef = adminDb.collection("users").doc(auth.uid).collection("achievements").doc(achievementId);
      await achRef.set({
        id: achievementId,
        name: body.achievementName ?? achievementId,
        description: body.achievementDescription ?? "",
        icon: body.achievementIcon ?? "star",
        unlockedAt: new Date().toISOString(),
        progress: 100,
      }, { merge: true });
    }

    return NextResponse.json({
      success: true,
      message: pointsDelta > 0 ? `+${pointsDelta} points` : "Score mis à jour",
      newScore: updateData.score,
    });
  } catch (err) {
    console.error("[leaderboard/post] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
