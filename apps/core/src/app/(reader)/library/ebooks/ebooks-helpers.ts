// =====================================================================
// 📚 Bibliothèque d'EPUBs personnels — logique pure (testée en node)
// =====================================================================
// Rien d'UI ici : quotas, progression, messages d'erreur par CODE (jamais
// par libellé) et URL de couverture. Extrait du composant pour être testé
// sans DOM (vitest core tourne en node — pas de parseur JSX).
// =====================================================================

/** Quota gratuit d'EPUBs par compte (miroir de ebooks.FreeEbookQuota). */
export const FREE_EBOOK_QUOTA = 5;

export interface EbookSummaryLike {
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

/** Couverture servie par l'app (proxy authentifié — jamais d'URL Go en clair). */
export function ebookCoverUrl(id: string): string {
  return `/api/ebooks/${encodeURIComponent(id)}/cover`;
}

/** URL de lecture d'un livre. */
export function ebookReadUrl(id: string): string {
  return `/library/ebooks/${encodeURIComponent(id)}`;
}

/**
 * Phrase de quota, honnête et informative : en gratuit on annonce le
 * décompte exact ; en Plus on annonce l'illimité sans remercier (pas de
 * vente de vent, pas de flatterie).
 */
export function describeEbookQuota(count: number, plus: boolean): string {
  if (plus) return 'Plus — imports illimités';
  const c = Math.max(0, count);
  return `${c} / ${FREE_EBOOK_QUOTA} livres gratuits`;
}

/** Le quota gratuit est-il atteint ? (l'upsell est alors affiché) */
export function isEbookQuotaReached(count: number, plus: boolean): boolean {
  return !plus && count >= FREE_EBOOK_QUOTA;
}

/**
 * Progression affichable : « Chapitre 3/12 · 42 % ». Rien à 0 % (un livre
 * jamais ouvert n'a pas de progression à célébrer).
 */
export function describeEbookProgress(book: EbookSummaryLike): string | null {
  const pct = clampPct(book.progressPct);
  if (pct <= 0) return null;
  const chapters = Math.max(0, book.chapterCount);
  if (chapters === 0) return `${pct} %`;
  const current = Math.min(Math.max(book.progressChapter, 0), chapters - 1);
  return `Chapitre ${current + 1}/${chapters} · ${pct} %`;
}

/** Borne un pourcentage 0-100 (miroir des CHECK du schéma). */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/** Borne un index de chapitre dans [0, chapterCount-1] (0 si vide). */
export function clampChapter(index: number, chapterCount: number): number {
  if (chapterCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(chapterCount - 1, Math.max(0, Math.trunc(index)));
}

/**
 * Message actionnable à partir du CODE d'erreur du backend (jamais du
 * libellé, qui peut changer). Un code inconnu retombe sur le message du
 * serveur, puis sur un générique.
 */
export function describeEbookError(code?: string | null, fallback?: string | null): string {
  switch (code) {
    case 'EBOOK_QUOTA_EXCEEDED':
      return `Quota de ${FREE_EBOOK_QUOTA} livres gratuits atteint — vos livres restent accessibles, Plus lèvera la limite.`;
    case 'EBOOK_DUPLICATE':
      return 'Ce livre est déjà dans votre bibliothèque.';
    case 'NOT_FOUND':
      return 'Livre introuvable.';
    case 'UNAUTHORIZED':
      return 'Connectez-vous pour accéder à vos livres.';
    default:
      return fallback || 'Import impossible pour le moment.';
  }
}

/** Fichier accepté à l'import : extension .epub (le Go re-vérifie le contenu). */
export function isEpubFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith('.epub');
}

/** Taille lisible (Mo, une décimale) — borne d'import affichée à l'utilisateur. */
export function describeEbookSizeLimit(maxBytes: number): string {
  return `${Math.round((maxBytes / (1024 * 1024)) * 10) / 10} Mo max`;
}
