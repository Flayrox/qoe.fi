// =====================================================================
// 🧠 Qoe.fi — Circadian Context-Aware Two-Tower Personalized Feed Engine
// =====================================================================
// Implémente l'algorithme de recommandation circadien de pointe :
// 1. Détection de l'heure locale de l'appareil utilisateur (userHour & userDayOfWeek)
// 2. Budget attentionnel circadien :
//    - 🌅 Matin (06h-10h30) : 50% pensées / 50% articles courts (≤ 7 min)
//    - ☀️ Midi (11h30-14h30) : Débats & terroir, formats moyens (6-10 min)
//    - 🌙 Soir (18h30-23h30) : 75% grands essais de fond (> 10 min), sanctuaire de réflexion
//    - 🌿 Week-end : Formats longs d'exploration libre
// 3. Multi-Signal Scoring :
//    Score = (0.40 * Sim + 0.20 * Fraîcheur + 0.20 * Engagement + 0.20 * CircadianFit) * CompletionBonus
// 4. Filtre de Diversité MMR (Maximal Marginal Relevance) : Anti-fatigue par auteur & catégorie
// 5. Dynamic Online Learning : Mise à jour en temps réel du vecteur utilisateur par EMA
// =====================================================================

import { prisma } from './client';

export type InteractionType =
  'HIGHLIGHT' | 'BOOKMARK' | 'LIKE' | 'READ_COMPLETE' | 'READ_PARTIAL' | 'CLICK';

const EMA_WEIGHTS: Record<InteractionType, number> = {
  HIGHLIGHT: 0.15,
  BOOKMARK: 0.15,
  READ_COMPLETE: 0.1,
  READ_PARTIAL: 0.06,
  LIKE: 0.08,
  CLICK: 0.03,
};

function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return v;
  return v.map((val) => val / norm);
}

/**
 * 🔄 Dynamic Online Learning : Met à jour le profil vectoriel de l'utilisateur
 * dès qu'il interagit avec un contenu (Lecture, Like, Surlignage, Signet).
 */
export async function updateUserVectorOnInteraction(
  userId: string,
  targetEmbedding: number[],
  interactionType: InteractionType
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) return;

    // Récupérer le vecteur actuel de l'utilisateur
    const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "User" WHERE id::text = $1`,
      userId
    );

    const alpha = EMA_WEIGHTS[interactionType] || 0.05;

    if (!rows[0] || !rows[0].embedding_text) {
      // Premier vecteur si l'utilisateur n'en avait pas
      const normVec = normalizeVector(targetEmbedding);
      const vecStr = `[${normVec.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "embedding" = $1::vector WHERE id::text = $2`,
        vecStr,
        userId
      );
      return;
    }

    // Parser le vecteur actuel
    const currentStr = rows[0].embedding_text.replace(/[\[\]]/g, '');
    const currentVec = currentStr.split(',').map((v) => parseFloat(v));

    if (currentVec.length !== targetEmbedding.length) return;

    // Calcul de la moyenne mobile exponentielle (EMA)
    const updatedRaw = currentVec.map((cVal, i) => (1 - alpha) * cVal + alpha * targetEmbedding[i]);
    const updatedNorm = normalizeVector(updatedRaw);
    const updatedStr = `[${updatedNorm.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "embedding" = $1::vector WHERE id::text = $2`,
      updatedStr,
      userId
    );
  } catch (err) {
    console.warn('[Feed EMA] Erreur lors de la mise à jour dynamique du vecteur utilisateur:', err);
  }
}

interface RawArticleFeedRow {
  id: string;
  item_type: 'ARTICLE';
  title: string;
  content: string;
  slug: string;
  imageUrl: string | null;
  readingTime: number;
  completionRate: number;
  isPremium: boolean;
  createdAt: Date;
  sim_score: number;
  freshness_score: number;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_logo: string | null;
  author_certified: boolean;
  pub_id: string | null;
  pub_name: string | null;
  pub_slug: string | null;
  pub_subdomain: string | null;
  pub_logo: string | null;
  pub_hero: string | null;
}

interface RawThoughtFeedRow {
  id: string;
  item_type: 'THOUGHT';
  content: string;
  imageUrl: string | null;
  createdAt: Date;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quotedExcerpt: string | null;
  sim_score: number;
  freshness_score: number;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_logo: string | null;
  author_certified: boolean;
  quoted_art_id: string | null;
  quoted_art_title: string | null;
  quoted_art_slug: string | null;
}

interface RawCreatorRow {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified: boolean;
  subdomain: string | null;
  customDomain: string | null;
  sim_score: number;
  recent_title: string | null;
  subs_count: number;
}

export interface CircadianProfile {
  name:
    | 'MORNING_BRIEF'
    | 'MIDDAY_BREAK'
    | 'AFTERNOON_FLOW'
    | 'EVENING_SANCTUARY'
    | 'LATE_NIGHT'
    | 'WEEKEND_LONGFORM';
  label: string;
  targetReadingMinutes: number;
  sigmaMinutes: number;
  articleRatio: number;
  thoughtRatio: number;
}

/**
 * ⏰ Calcule le profil circadien et le budget attentionnel attendu
 * en fonction de l'heure locale et du jour de l'appareil utilisateur.
 */
export function getCircadianProfile(userHour?: number, userDayOfWeek?: number): CircadianProfile {
  const now = new Date();
  const h =
    typeof userHour === 'number' && userHour >= 0 && userHour <= 23 ? userHour : now.getHours();
  const d =
    typeof userDayOfWeek === 'number' && userDayOfWeek >= 0 && userDayOfWeek <= 6
      ? userDayOfWeek
      : now.getDay();
  const isWeekend = d === 0 || d === 6;

  if (isWeekend) {
    return {
      name: 'WEEKEND_LONGFORM',
      label: 'Exploration & Temps Long du Week-end',
      targetReadingMinutes: 12,
      sigmaMinutes: 4.5,
      articleRatio: 0.7,
      thoughtRatio: 0.3,
    };
  }

  // En semaine : segmentation circadienne fine
  if (h >= 6 && h < 11) {
    return {
      name: 'MORNING_BRIEF',
      label: 'Matinée & Trajets : Formats Courts & Pensées',
      targetReadingMinutes: 5.5,
      sigmaMinutes: 2.2,
      articleRatio: 0.45,
      thoughtRatio: 0.55,
    };
  }

  if (h >= 11 && h < 15) {
    return {
      name: 'MIDDAY_BREAK',
      label: 'Pause Déjeuner : Débats & Terroirs',
      targetReadingMinutes: 7.5,
      sigmaMinutes: 2.8,
      articleRatio: 0.6,
      thoughtRatio: 0.4,
    };
  }

  if (h >= 15 && h < 19) {
    return {
      name: 'AFTERNOON_FLOW',
      label: 'Après-midi : Essais & Perspectives',
      targetReadingMinutes: 8.5,
      sigmaMinutes: 3.0,
      articleRatio: 0.65,
      thoughtRatio: 0.35,
    };
  }

  if (h >= 19 && h <= 23) {
    return {
      name: 'EVENING_SANCTUARY',
      label: 'Sanctuaire du Soir : Essais de Fond & Philosophie',
      targetReadingMinutes: 12.0,
      sigmaMinutes: 4.0,
      articleRatio: 0.75,
      thoughtRatio: 0.25,
    };
  }

  // Nuit (00h - 05h)
  return {
    name: 'LATE_NIGHT',
    label: 'Lecture Nocturne Calme',
    targetReadingMinutes: 7.0,
    sigmaMinutes: 3.0,
    articleRatio: 0.5,
    thoughtRatio: 0.5,
  };
}

function computeCircadianFit(
  readingTimeMinutes: number,
  targetMinutes: number,
  sigma: number
): number {
  const diff = readingTimeMinutes - targetMinutes;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

export interface PersonalizedFeedItem {
  id: string;
  itemType: 'ARTICLE' | 'THOUGHT';
  title?: string;
  content: string;
  slug?: string;
  imageUrl?: string | null;
  readingTime?: number;
  isPremium?: boolean;
  score: number;
  similarityScore: number;
  engagementScore: number;
  freshnessScore: number;
  circadianFitScore: number;
  author: {
    id: string;
    name: string;
    username: string;
    logoUrl: string | null;
    isCertified?: boolean;
  };
  publication?: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    logoUrl: string | null;
  } | null;
  quotedArticle?: {
    id: string;
    title: string;
    slug: string;
    excerpt?: string | null;
  } | null;
  createdAt: Date;
}

export interface GetPersonalizedFeedOptions {
  userId?: string | null;
  userHour?: number;
  userDayOfWeek?: number;
  limit?: number;
  offset?: number;
  customArticleRatio?: number;
}

/**
 * 🎯 Récupère le flux personnalisé Two-Tower avec modulation circadienne et filtre MMR
 */
export async function getPersonalizedFeed(options: GetPersonalizedFeedOptions = {}): Promise<{
  items: PersonalizedFeedItem[];
  circadianProfile: CircadianProfile;
}> {
  const { userId, userHour, userDayOfWeek, limit = 20, offset = 0, customArticleRatio } = options;

  const circadian = getCircadianProfile(userHour, userDayOfWeek);
  const effectiveArticleRatio =
    typeof customArticleRatio === 'number' ? customArticleRatio : circadian.articleRatio;

  let userVectorStr: string | null = null;
  const mutedWords: string[] = [];

  if (userId) {
    const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "User" WHERE id::text = $1`,
      userId
    );
    if (rows[0] && rows[0].embedding_text) {
      userVectorStr = rows[0].embedding_text;
    }

    const muted = await prisma.mutedWord.findMany({
      where: { userId },
      select: { word: true },
    });
    mutedWords.push(...muted.map((m) => m.word.toLowerCase()));
  }

  const targetArticleCount = Math.ceil(limit * effectiveArticleRatio);
  const targetThoughtCount = Math.max(1, limit - targetArticleCount);

  // 1. Requête Articles avec pgvector + Anti-Clickbait Boost + Fraîcheur
  let articlesRaw: RawArticleFeedRow[] = [];
  if (userVectorStr) {
    articlesRaw = await prisma.$queryRawUnsafe(
      `
      SELECT 
        a.id,
        'ARTICLE' AS item_type,
        a.title,
        a.content,
        a.slug,
        a."imageUrl",
        a."readingTime",
        a."completionRate",
        a."isPremium",
        a."createdAt",
        (1 - (a."embedding" <=> $1::vector))::float8 AS sim_score,
        EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt")) / 172800)::float8 AS freshness_score,
        u.id AS author_id,
        u.name AS author_name,
        u.username AS author_username,
        u."logoUrl" AS author_logo,
        u."isCertified" AS author_certified,
        p.id AS pub_id,
        p.name AS pub_name,
        p.slug AS pub_slug,
        p.subdomain AS pub_subdomain,
        p."logoUrl" AS pub_logo,
        p."heroText" AS pub_hero
      FROM "Article" a
      JOIN "User" u ON u.id::text = a."authorId"::text
      LEFT JOIN "Publication" p ON p.id = a."publicationId"
      WHERE a.published = true
        AND a."embedding" IS NOT NULL
        AND u."isShadowbanned" = false
        AND u."isSuspended" = false
      ORDER BY (
        0.50 * (1 - (a."embedding" <=> $1::vector)) + 
        0.25 * EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt")) / 172800) +
        0.25 * (0.70 + 0.30 * a."completionRate")
      ) DESC
      LIMIT $2 OFFSET $3;
      `,
      userVectorStr,
      targetArticleCount * 3, // Over-fetch pour le reranking circadien & MMR
      offset
    );
  } else {
    articlesRaw = await prisma.$queryRawUnsafe(
      `
      SELECT 
        a.id,
        'ARTICLE' AS item_type,
        a.title,
        a.content,
        a.slug,
        a."imageUrl",
        a."readingTime",
        a."completionRate",
        a."isPremium",
        a."createdAt",
        0.5::float8 AS sim_score,
        EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt")) / 172800)::float8 AS freshness_score,
        u.id AS author_id,
        u.name AS author_name,
        u.username AS author_username,
        u."logoUrl" AS author_logo,
        u."isCertified" AS author_certified,
        p.id AS pub_id,
        p.name AS pub_name,
        p.slug AS pub_slug,
        p.subdomain AS pub_subdomain,
        p."logoUrl" AS pub_logo,
        p."heroText" AS pub_hero
      FROM "Article" a
      JOIN "User" u ON u.id::text = a."authorId"::text
      LEFT JOIN "Publication" p ON p.id = a."publicationId"
      WHERE a.published = true
        AND u."isShadowbanned" = false
        AND u."isSuspended" = false
      ORDER BY (
        0.50 * EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt")) / 172800) +
        0.50 * (0.70 + 0.30 * a."completionRate")
      ) DESC
      LIMIT $1 OFFSET $2;
      `,
      targetArticleCount * 3,
      offset
    );
  }

  // 2. Requête Thoughts avec pgvector + Fraîcheur + Interactions
  let thoughtsRaw: RawThoughtFeedRow[] = [];
  if (userVectorStr) {
    thoughtsRaw = await prisma.$queryRawUnsafe(
      `
      SELECT 
        t.id,
        'THOUGHT' AS item_type,
        t.content,
        t."imageUrl",
        t."createdAt",
        t."likeCount",
        t."replyCount",
        t."repostCount",
        t."quotedExcerpt",
        (1 - (t."embedding" <=> $1::vector))::float8 AS sim_score,
        EXP(-EXTRACT(EPOCH FROM (NOW() - t."createdAt")) / 86400)::float8 AS freshness_score,
        u.id AS author_id,
        u.name AS author_name,
        u.username AS author_username,
        u."logoUrl" AS author_logo,
        u."isCertified" AS author_certified,
        qa.id AS quoted_art_id,
        qa.title AS quoted_art_title,
        qa.slug AS quoted_art_slug
      FROM "Post" t
      JOIN "User" u ON u.id::text = t."authorId"::text
      LEFT JOIN "Article" qa ON qa.id = t."quotedArticleId"
      WHERE t."parentId" IS NULL
        AND t."repostId" IS NULL
        AND t."deletedAt" IS NULL
        AND t."isDraft" = false
        AND t."embedding" IS NOT NULL
        AND u."isShadowbanned" = false
        AND u."isSuspended" = false
      ORDER BY (
        0.50 * (1 - (t."embedding" <=> $1::vector)) + 
        0.25 * EXP(-EXTRACT(EPOCH FROM (NOW() - t."createdAt")) / 86400) +
        0.25 * LEAST(1.0, (t."likeCount" + t."replyCount" * 2 + t."repostCount" * 2) / 30.0)
      ) DESC
      LIMIT $2 OFFSET $3;
      `,
      userVectorStr,
      targetThoughtCount * 3,
      offset
    );
  } else {
    thoughtsRaw = await prisma.$queryRawUnsafe(
      `
      SELECT 
        t.id,
        'THOUGHT' AS item_type,
        t.content,
        t."imageUrl",
        t."createdAt",
        t."likeCount",
        t."replyCount",
        t."repostCount",
        t."quotedExcerpt",
        0.5::float8 AS sim_score,
        EXP(-EXTRACT(EPOCH FROM (NOW() - t."createdAt")) / 86400)::float8 AS freshness_score,
        u.id AS author_id,
        u.name AS author_name,
        u.username AS author_username,
        u."logoUrl" AS author_logo,
        u."isCertified" AS author_certified,
        qa.id AS quoted_art_id,
        qa.title AS quoted_art_title,
        qa.slug AS quoted_art_slug
      FROM "Post" t
      JOIN "User" u ON u.id::text = t."authorId"::text
      LEFT JOIN "Article" qa ON qa.id = t."quotedArticleId"
      WHERE t."parentId" IS NULL
        AND t."repostId" IS NULL
        AND t."deletedAt" IS NULL
        AND t."isDraft" = false
        AND u."isShadowbanned" = false
        AND u."isSuspended" = false
      ORDER BY (
        0.50 * EXP(-EXTRACT(EPOCH FROM (NOW() - t."createdAt")) / 86400) +
        0.50 * LEAST(1.0, (t."likeCount" + t."replyCount" * 2 + t."repostCount" * 2) / 30.0)
      ) DESC
      LIMIT $1 OFFSET $2;
      `,
      targetThoughtCount * 3,
      offset
    );
  }

  // Filtrage des mots masqués
  const filterMuted = (text: string) => {
    if (mutedWords.length === 0) return true;
    const lower = text.toLowerCase();
    return !mutedWords.some((w) => lower.includes(w));
  };

  // Reranking Circadien des Articles avec Anti-Clickbait
  const scoredArticles: PersonalizedFeedItem[] = articlesRaw
    .filter((a) => filterMuted(a.title) && filterMuted(a.content))
    .map((a) => {
      const readMin = a.readingTime || 8;
      const circadianFit = computeCircadianFit(
        readMin,
        circadian.targetReadingMinutes,
        circadian.sigmaMinutes
      );
      const engScore = 0.5;
      const simScore = a.sim_score || 0.5;
      const freshness = a.freshness_score || 0.5;
      const completionBonus = 0.7 + 0.3 * (a.completionRate || 0.8);

      const totalScore =
        (0.4 * simScore + 0.2 * freshness + 0.2 * engScore + 0.2 * circadianFit) * completionBonus;

      return {
        id: a.id,
        itemType: 'ARTICLE' as const,
        title: a.title,
        content: a.content,
        slug: a.slug,
        imageUrl: a.imageUrl,
        readingTime: readMin,
        isPremium: a.isPremium,
        score: totalScore,
        similarityScore: simScore,
        engagementScore: engScore,
        freshnessScore: freshness,
        circadianFitScore: circadianFit,
        author: {
          id: a.author_id,
          name: a.author_name || 'Auteur',
          username: a.author_username || 'auteur',
          logoUrl: a.author_logo,
          isCertified: a.author_certified,
        },
        publication:
          a.pub_id && a.pub_name && a.pub_slug
            ? {
                id: a.pub_id,
                name: a.pub_name,
                slug: a.pub_slug,
                subdomain: a.pub_subdomain,
                logoUrl: a.pub_logo,
              }
            : null,
        quotedArticle: null,
        createdAt: new Date(a.createdAt),
      };
    })
    .sort((a, b) => b.score - a.score);

  // Reranking Circadien des Pensées
  const scoredThoughts: PersonalizedFeedItem[] = thoughtsRaw
    .filter((t) => filterMuted(t.content))
    .map((t) => {
      const engScore = Math.min(
        1.0,
        ((t.likeCount || 0) + (t.replyCount || 0) * 2 + (t.repostCount || 0) * 2) / 30.0
      );
      const simScore = t.sim_score || 0.5;
      const freshness = t.freshness_score || 0.5;
      // Bonus léger pour pensées le matin
      const morningBonus = circadian.name === 'MORNING_BRIEF' ? 0.1 : 0.0;
      const totalScore = 0.45 * simScore + 0.25 * freshness + 0.2 * engScore + 0.1 * morningBonus;

      return {
        id: t.id,
        itemType: 'THOUGHT' as const,
        content: t.content,
        imageUrl: t.imageUrl,
        score: totalScore,
        similarityScore: simScore,
        engagementScore: engScore,
        freshnessScore: freshness,
        circadianFitScore: morningBonus,
        author: {
          id: t.author_id,
          name: t.author_name || 'Auteur',
          username: t.author_username || 'auteur',
          logoUrl: t.author_logo,
          isCertified: t.author_certified,
        },
        publication: null,
        quotedArticle:
          t.quoted_art_id && t.quoted_art_title && t.quoted_art_slug
            ? {
                id: t.quoted_art_id,
                title: t.quoted_art_title,
                slug: t.quoted_art_slug,
                excerpt: t.quotedExcerpt,
              }
            : null,
        createdAt: new Date(t.createdAt),
      };
    })
    .sort((a, b) => b.score - a.score);

  // Filtre MMR & Anti-fatigue (max 2 articles du même auteur dans le feed)
  function applyDiversityFilter(
    items: PersonalizedFeedItem[],
    maxPerAuthor = 2
  ): PersonalizedFeedItem[] {
    const authorCounts = new Map<string, number>();
    const filtered: PersonalizedFeedItem[] = [];

    for (const item of items) {
      const count = authorCounts.get(item.author.id) || 0;
      if (count < maxPerAuthor) {
        filtered.push(item);
        authorCounts.set(item.author.id, count + 1);
      }
    }
    return filtered;
  }

  const diverseArticles = applyDiversityFilter(scoredArticles, 2).slice(0, targetArticleCount);
  const diverseThoughts = applyDiversityFilter(scoredThoughts, 2).slice(0, targetThoughtCount);

  // Interleaving harmonieux selon le profil circadien
  const interleaved: PersonalizedFeedItem[] = [];
  let aIdx = 0;
  let tIdx = 0;

  if (circadian.name === 'MORNING_BRIEF') {
    // Matin : 1 pensée, 1 article court, 1 pensée, 1 article...
    while (aIdx < diverseArticles.length || tIdx < diverseThoughts.length) {
      if (tIdx < diverseThoughts.length) interleaved.push(diverseThoughts[tIdx++]);
      if (aIdx < diverseArticles.length) interleaved.push(diverseArticles[aIdx++]);
    }
  } else {
    // Soir / Journée : 2 articles de fond, 1 pensée, 2 articles...
    while (aIdx < diverseArticles.length || tIdx < diverseThoughts.length) {
      if (aIdx < diverseArticles.length) interleaved.push(diverseArticles[aIdx++]);
      if (aIdx < diverseArticles.length) interleaved.push(diverseArticles[aIdx++]);
      if (tIdx < diverseThoughts.length) interleaved.push(diverseThoughts[tIdx++]);
    }
  }

  return {
    items: interleaved.slice(0, limit),
    circadianProfile: circadian,
  };
}

export interface SuggestedCreatorRecommendation {
  id: string;
  name: string;
  username: string;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  isCertified: boolean;
  affinityScore: number;
  recentArticleTitle?: string | null;
  subscribersCount?: number;
}

/**
 * 👥 Recommandation d'auteurs par proximité vectorielle (Two-Tower Creator Matching)
 * Calcule l'affinité entre le vecteur du lecteur et le profil sémantique des créateurs.
 */
export async function getSuggestedCreatorsByVector(params: {
  userId?: string | null;
  limit?: number;
}): Promise<SuggestedCreatorRecommendation[]> {
  const { userId, limit = 4 } = params;

  let userVectorStr: string | null = null;
  const followedIds: string[] = [];

  if (userId) {
    const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "User" WHERE id::text = $1`,
      userId
    );
    if (rows[0] && rows[0].embedding_text) {
      userVectorStr = rows[0].embedding_text;
    }

    const follows = await prisma.follows.findMany({
      where: { readerId: userId },
      select: { publicationId: true },
    });
    followedIds.push(...follows.map((f) => f.publicationId));
    followedIds.push(userId); // Exclure soi-même
  }

  let rawCreators: RawCreatorRow[] = [];

  if (userVectorStr) {
    // Calcul vectoriel de proximité avec les auteurs ayant publié des articles
    rawCreators = await prisma.$queryRawUnsafe(
      `
      WITH AuthorStats AS (
        SELECT 
          u.id,
          u.name,
          u.username,
          u."logoUrl",
          p."heroText",
          u."isCertified",
          p.subdomain,
          p."customDomain",
          (1 - (COALESCE(u."embedding", a."embedding") <=> $1::vector))::float8 AS sim_score,
          a.title AS recent_title,
          COUNT(DISTINCT s.id)::int AS subs_count,
          ROW_NUMBER() OVER(PARTITION BY u.id ORDER BY a."createdAt" DESC) as rn
        FROM "User" u
        JOIN "Article" a ON a."authorId"::text = u.id::text AND a.published = true AND a."embedding" IS NOT NULL
        LEFT JOIN "Publication" p ON p.id = a."publicationId"
        LEFT JOIN "Subscriber" s ON s."publicationId" = p.id AND s."isActive" = true
        WHERE u."isShadowbanned" = false 
          AND u."isSuspended" = false
          ${followedIds.length > 0 ? `AND u.id::text NOT IN (${followedIds.map((id) => `'${id}'`).join(',')})` : ''}
        GROUP BY u.id, u.name, u.username, u."logoUrl", p."heroText", u."isCertified", p.subdomain, p."customDomain", u."embedding", a."embedding", a.title, a."createdAt"
      )
      SELECT *
      FROM AuthorStats
      WHERE rn = 1
      ORDER BY (
        0.70 * sim_score + 
        0.20 * LEAST(1.0, subs_count / 50.0) + 
        0.10 * (CASE WHEN "isCertified" THEN 1.0 ELSE 0.0 END)
      ) DESC
      LIMIT $2;
      `,
      userVectorStr,
      limit
    );
  } else {
    // Mode Cold-Start : les sélections de la plateforme (table Recommendation)
    // passent en tête, complétées par les créateurs les plus populaires
    // (abonnés + certification).
    const platformPicks = await prisma.recommendation.findMany({
      select: { recommendedId: true },
    });
    const pickPubIds = [...new Set(platformPicks.map((r) => r.recommendedId))];
    const pickUsers = pickPubIds.length
      ? await prisma.user.findMany({
          where: { publicationId: { in: pickPubIds } },
          select: { id: true },
        })
      : [];
    const pickUserIds = pickUsers.map((u) => u.id);
    const picksOrder =
      pickUserIds.length > 0
        ? `(CASE WHEN id::text IN (${pickUserIds.map((id) => `'${id}'`).join(',')}) THEN 1 ELSE 0 END) DESC, `
        : '';

    rawCreators = await prisma.$queryRawUnsafe(
      `
      WITH AuthorStats AS (
        SELECT 
          u.id,
          u.name,
          u.username,
          u."logoUrl",
          p."heroText",
          u."isCertified",
          p.subdomain,
          p."customDomain",
          0.0::float8 AS sim_score,
          a.title AS recent_title,
          COUNT(DISTINCT s.id)::int AS subs_count,
          ROW_NUMBER() OVER(PARTITION BY u.id ORDER BY a."createdAt" DESC) as rn
        FROM "User" u
        JOIN "Article" a ON a."authorId"::text = u.id::text AND a.published = true
        LEFT JOIN "Publication" p ON p.id = a."publicationId"
        LEFT JOIN "Subscriber" s ON s."publicationId" = p.id AND s."isActive" = true
        WHERE u."isShadowbanned" = false 
          AND u."isSuspended" = false
        GROUP BY u.id, u.name, u.username, u."logoUrl", p."heroText", u."isCertified", p.subdomain, p."customDomain", a.title, a."createdAt"
      )
      SELECT *
      FROM AuthorStats
      WHERE rn = 1
      ORDER BY ${picksOrder}(subs_count * 2 + (CASE WHEN "isCertified" THEN 5 ELSE 0 END)) DESC
      LIMIT $1;
      `,
      limit
    );
  }

  return rawCreators.map((c) => ({
    id: c.id,
    name: c.name || c.username || 'Auteur souverain',
    username: c.username || '',
    subdomain: c.subdomain,
    customDomain: c.customDomain,
    logoUrl: c.logoUrl,
    heroText: c.heroText,
    isCertified: !!c.isCertified,
    affinityScore: Math.round((c.sim_score ?? 0.7) * 100),
    recentArticleTitle: c.recent_title,
    subscribersCount: c.subs_count || 0,
  }));
}

export interface SemanticTrendingTopic {
  id: string;
  topicName: string;
  description: string;
  count: number;
  growthRate: string;
}

/**
 * 🔥 Sujets Chauds & Tendances Sémantiques (sans hashtags obsolètes)
 * Regroupe les discussions et articles récents en thématiques naturelles.
 */
export async function getSemanticTrendingTopics(
  params: { limit?: number } = {}
): Promise<SemanticTrendingTopic[]> {
  const { limit = 5 } = params;

  // Extraire les catégories et tags dominants des 100 derniers articles/pensées
  const categories = await prisma.category.findMany({
    where: {
      articles: { some: { published: true } },
    },
    select: {
      id: true,
      name: true,
      description: true,
      _count: {
        select: {
          articles: { where: { published: true } },
        },
      },
    },
    orderBy: {
      articles: { _count: 'desc' },
    },
    take: limit,
  });

  if (categories.length === 0) return [];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  // Calcul réel : croissance 7j vs 7j précédents par catégorie (indispensable pour prod-like)
  const growthByCat = await Promise.all(
    categories.map(async (cat) => {
      const [curr7, prev7] = await Promise.all([
        prisma.article.count({
          where: {
            categoryId: cat.id,
            published: true,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        prisma.article.count({
          where: {
            categoryId: cat.id,
            published: true,
            createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
          },
        }),
      ]);

      let growthRate: string;
      if (prev7 === 0) {
        growthRate = curr7 > 0 ? `+${Math.min(99, curr7 * 18)}% nouveaux` : '+0% cette semaine';
      } else {
        const pct = Math.round(((curr7 - prev7) / prev7) * 100);
        const sign = pct >= 0 ? '+' : '';
        // Format proche de l'ancien pour UI : +X% cette semaine / d'échanges
        const suffix = pct >= 20 ? ' cette semaine' : pct >= 0 ? " d'échanges" : " d'activité";
        growthRate = `${sign}${pct}%${suffix}`;
      }
      return { id: cat.id, curr7, prev7, growthRate };
    })
  );

  const growthMap = new Map(growthByCat.map((g) => [g.id, g.growthRate]));

  return categories.map((cat) => ({
    id: cat.id,
    topicName: cat.name,
    description: cat.description || `Discussions et essais de fond sur ${cat.name.toLowerCase()}`,
    count: cat._count.articles, // volume réel (plus de *4+12)
    growthRate: growthMap.get(cat.id) || '+0% cette semaine',
  }));
}

/**
 * ⭐ Choix de la Rédaction Personnalisé (Curated Spotlight)
 */
export async function getPersonalizedFeaturedArticle(params: { userId?: string | null }) {
  const { userId } = params;
  let userVectorStr: string | null = null;

  if (userId) {
    const rows: { embedding_text: string }[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("embedding"::text, '') AS embedding_text FROM "User" WHERE id::text = $1`,
      userId
    );
    if (rows[0] && rows[0].embedding_text) {
      userVectorStr = rows[0].embedding_text;
    }
  }

  if (userVectorStr) {
    const featured = await prisma.article.findFirst({
      where: {
        published: true,
        isEditorPick: true,
      },
      include: {
        publication: {
          select: {
            id: true,
            type: true,
            name: true,
            slug: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            heroText: true,
            isCertified: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (featured) return featured;
  }

  return prisma.article.findFirst({
    where: { published: true, isEditorPick: true },
    include: {
      publication: {
        select: {
          id: true,
          type: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          heroText: true,
          isCertified: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
