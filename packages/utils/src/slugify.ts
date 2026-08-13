// =====================================================================
// 🔗 slugify — Génère des slugs URL-friendly
// =====================================================================
// 📖 Transforme "Mon Article Génial !" → "mon-article-genial"
//    Utilisé pour les URLs d'articles, catégories, tags, etc.
// =====================================================================

/**
 * 🔗 Convertit un texte en slug URL-safe.
 *
 * @example
 *   slugify("Mon Article Génial !") // "mon-article-genial"
 *   slugify("Café & Thé: L'essentiel") // "cafe-the-lessentiel"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD') // décompose les accents (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '') // supprime les marques diacritiques
    .replace(/[^a-z0-9\s-]/g, '') // supprime caractères spéciaux
    .replace(/\s+/g, '-') // espaces → tirets
    .replace(/-+/g, '-') // tirets multiples → un seul
    .replace(/^-+|-+$/g, ''); // supprime tirets en début/fin
}

/**
 * 🎲 Génère un ID court random (8 caractères alphanumériques).
 * Utile pour des références uniques lisibles.
 */
export function shortId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * 🆔 Génère un UUID v4 (crypto-secure).
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
