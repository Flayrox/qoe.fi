// =====================================================================
// 📝 excerpt/clean-excerpt.ts — Extraction & nettoyage d'extraits
// =====================================================================

import { decodeHtmlEntities } from './html-entities';

/**
 * Nettoie une chaîne HTML pour en extraire un résumé textuel propre,
 * sans balises, sans espaces multiples, tronqué avec ellipse si nécessaire.
 */
export function cleanArticleExcerpt(rawHtml: string | null | undefined, maxLength = 160): string {
  if (!rawHtml) return '';

  // 1. Remplace les balises de rupture par des espaces
  let text = rawHtml.replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, ' ');
  text = text.replace(/<(br|hr)\s*\/?>/gi, ' ');

  // 2. Supprime toutes les balises HTML restantes
  text = text.replace(/<[^>]*>/g, '');

  // 3. Décode les entités HTML
  text = decodeHtmlEntities(text);

  // 4. Normalise les espaces multiples, retours à la ligne et tabulations
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length <= maxLength) {
    return text;
  }

  // 5. Tronquage propre : cherche le dernier espace avant la limite
  // F151 — `maxLength` compte des unités UTF-16 : une coupe au milieu d'un
  // emoji laissait une demi-paire de substitution dans l'extrait (stockée en
  // base, elle casse le JSON et l'encodage UTF-8).
  const raw = text.slice(0, Math.max(0, maxLength));
  const truncated = /[\uD800-\uDBFF]$/.test(raw) ? raw.slice(0, -1) : raw;
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return `${truncated.slice(0, lastSpace).trim()}…`;
  }

  return `${truncated.trim()}…`;
}
