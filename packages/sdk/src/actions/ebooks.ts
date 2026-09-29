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
}); /** Supprimer un livre (le brut n'a jamais été stocké — rien d'autre à purger). */
export const deleteEbookAction = safeAction<{ id: string }, { deleted: boolean }>(
  async ({ id }) => {
    return goFetch<{ deleted: boolean }>(`/v1/me/ebooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
);

// ── Notes de lecture (table dédiée, jamais publiques) ──────────────────

export interface EbookNote {
  id: string;
  chapterIndex: number;
  chapterTitle: string;
  excerpt: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Mes notes sur un livre (ordre de lecture). */
export const listEbookNotesAction = safeAction<{ ebookId: string }, { items: EbookNote[] }>(
  async ({ ebookId }) => {
    const res = await goFetch<{ items: EbookNote[] }>(
      `/v1/me/ebooks/${encodeURIComponent(ebookId)}/notes`
    );
    return { items: res.items ?? [] };
  }
);

/**
 * Créer une note : un passage et/ou un mot à soi (les deux vides = 400
 * NOTE vide, l'extrait est tronqué à 1000, la note refusée au-delà de 4000).
 */
export const addEbookNoteAction = safeAction<
  { ebookId: string; chapter: number; chapterTitle: string; excerpt: string; note: string },
  EbookNote
>(async ({ ebookId, chapter, chapterTitle, excerpt, note }) => {
  return goFetch<EbookNote>(`/v1/me/ebooks/${encodeURIComponent(ebookId)}/notes`, {
    method: 'POST',
    body: { chapter, chapterTitle, excerpt, note },
  });
});

/** Modifier le texte d'une note (l'extrait ne bouge pas). */
export const updateEbookNoteAction = safeAction<
  { ebookId: string; noteId: string; note: string },
  EbookNote
>(async ({ ebookId, noteId, note }) => {
  return goFetch<EbookNote>(
    `/v1/me/ebooks/${encodeURIComponent(ebookId)}/notes/${encodeURIComponent(noteId)}`,
    { method: 'PATCH', body: { note } }
  );
});

/** Supprimer une note (404 explicite sur un id inconnu). */
export const deleteEbookNoteAction = safeAction<
  { ebookId: string; noteId: string },
  { deleted: boolean }
>(async ({ ebookId, noteId }) => {
  return goFetch<{ deleted: boolean }>(
    `/v1/me/ebooks/${encodeURIComponent(ebookId)}/notes/${encodeURIComponent(noteId)}`,
    { method: 'DELETE' }
  );
});
