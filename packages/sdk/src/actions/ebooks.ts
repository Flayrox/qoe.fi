'use server';

// =====================================================================
// 📚 actions/ebooks — EPUBs personnels côté lecteur (fiche Plus P1)
// =====================================================================
// Bibliothèque STRICTEMENT personnelle (jamais publiée, jamais partagée) :
// le backend Go ne répond que sur le JWT du propriétaire (un livre d'autrui
// ressemble à un inexistant). Le brut uploadé est jeté après parse — seul
// le parsé strict (titres, paragraphes, emphases) est stocké, il n'y a
// donc rien d'autre à purger à la suppression.
// L'IMPORT (multipart 20 Mo) et la COUVERTURE (binaire) passent par les
// routes Next `/api/ebooks/*` — les server actions ne transportent pas de
// fichier (limite de corps) et le navigateur n'a jamais le jeton Go.
// Codes stables remontés tels quels : EBOOK_QUOTA_EXCEEDED (403, upsell
// informatif — jamais de vente de vent), EBOOK_DUPLICATE (409), NOT_FOUND.
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';

export interface EbookSummary {
  id: string;
  title: string;
  author: string;
  language: string;
  chapterCount: number;
  hasCover: boolean;
  progressChapter: number;
  progressPct: number;
  createdAt: string;
}

export interface EbookChapter {
  title: string;
  html: string;
}

export interface EbookDetail extends EbookSummary {
  chapters: EbookChapter[];
}

/** Ma bibliothèque (sans chapitres ni couverture — endpoints dédiés). */
export const listEbooksAction = safeAction<void, { items: EbookSummary[] }>(async () => {
  const res = await goFetch<{ items: EbookSummary[] }>('/v1/me/ebooks');
  return { items: res.items ?? [] };
});

/** Un livre + ses chapitres (lecture). */
export const getEbookAction = safeAction<{ id: string }, EbookDetail>(async ({ id }) => {
  return goFetch<EbookDetail>(`/v1/me/ebooks/${encodeURIComponent(id)}`);
});

/** Progression synchronisée (multi-appareils, last-write-wins assumé). */
export const setEbookProgressAction = safeAction<
  { id: string; chapter: number; pct: number },
  { success: boolean }
>(async ({ id, chapter, pct }) => {
  return goFetch<{ success: boolean }>(`/v1/me/ebooks/${encodeURIComponent(id)}/progress`, {
    method: 'PATCH',
    body: { chapter, pct },
  });
});

/** Supprimer un livre (le brut n'a jamais été stocké — rien d'autre à purger). */
export const deleteEbookAction = safeAction<{ id: string }, { deleted: boolean }>(
  async ({ id }) => {
    return goFetch<{ deleted: boolean }>(`/v1/me/ebooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
);
