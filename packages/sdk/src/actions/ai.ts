'use server';

// =====================================================================
// 🤖 actions/ai — IA de lecture côté lecteur (fiche Plus P1)
// =====================================================================
// Résumé fidèle + explication d'extrait, quotas mensuels transparents.
// Les codes d'erreur backend (AI_PLUS_REQUIRED, AI_QUOTA_EXCEEDED,
// AI_UNAVAILABLE, AI_BUSY) remontent tels quels — le front branche dessus,
// jamais sur les libellés.
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';

export interface AIUsage {
  limit: number;
  remaining: number;
  plus: boolean;
}

/** Résumé fidèle d'un article (coupé au paywall comme la lecture). */
export const summarizeArticleAction = safeAction<
  { articleId: string; locale?: string },
  { summary: string; usage: AIUsage }
>(async ({ articleId, locale }) => {
  return goFetch<{ summary: string; usage: AIUsage }>('/v1/ai/summarize', {
    method: 'POST',
    body: { articleId, locale: locale ?? '' },
  });
});

/** Explication d'un extrait (1-2000 caractères, fournis par l'utilisateur). */
export const explainPassageAction = safeAction<
  { text: string; locale?: string },
  { explanation: string; usage: AIUsage }
>(async ({ text, locale }) => {
  return goFetch<{ explanation: string; usage: AIUsage }>('/v1/ai/explain', {
    method: 'POST',
    body: { text, locale: locale ?? '' },
  });
});

/** Quota restant (lecture seule — ne consomme rien). */
export const getAIUsageAction = safeAction<void, AIUsage>(async () => {
  return goFetch<AIUsage>('/v1/ai/usage');
});
