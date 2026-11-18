// =====================================================================
// 🔗 slugify — Génère des slugs URL-friendly
// =====================================================================
// 📖 Transforme "Mon Article Génial !" → "mon-article-genial"
//    Utilisé pour les URLs d'articles, catégories, tags, ancres de titres.
//
// Deux règles non négociables :
//   1. Une lettre lisible ne disparaît jamais silencieusement. `NFD` ne
//      décompose ni les ligatures (œ, æ), ni ß, ø, ł, đ… : sans table de
//      translittération, « Cœur » devenait « cur » et « Straße » → « strae ».
//   2. Un slug est borné. Au-delà de la limite, les URLs d'articles et les
//      ancres grossissent sans fin (et certaines colonnes SQL tronquent).
// =====================================================================

/** Limite par défaut : assez large pour un titre, assez court pour une URL. */
export const MAX_SLUG_LENGTH = 96;

/**
 * Lettres que `String#normalize('NFD')` ne décompose pas en ASCII. La clé est
 * en minuscules : l'entrée est mise en minuscules avant la translittération.
 */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŋ: 'n',
  ŧ: 't',
  ĸ: 'k',
  ĳ: 'ij',
  ŀ: 'l',
  ƒ: 'f',
};

const TRANSLITERATION_RE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

/** Coupe un slug déjà normalisé sur une frontière de mot. */
function clampSlug(slug: string, maxLength: number): string {
  const limit =
    Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : MAX_SLUG_LENGTH;
  if (slug.length <= limit) return slug;

  const cut = slug.slice(0, limit);
  const lastDash = cut.lastIndexOf('-');
  const wordSafe = lastDash > limit * 0.6 ? cut.slice(0, lastDash) : cut;
  return wordSafe.replace(/-+$/, '');
}

/**
 * 🔗 Convertit un texte en slug URL-safe.
 *
 * @example
 *   slugify("Mon Article Génial !") // "mon-article-genial"
 *   slugify("Café & Thé: L'essentiel") // "cafe-the-lessentiel"
 *   slugify("Cœur & Œuvre") // "coeur-oeuvre"
 */
export function slugify(input: string, maxLength: number = MAX_SLUG_LENGTH): string {
  const slug = (input ?? '')
    .toLowerCase()
    .trim()
    .replace(TRANSLITERATION_RE, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize('NFD') // décompose les accents (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '') // supprime les marques diacritiques
    .replace(/[^a-z0-9\s-]/g, '') // supprime caractères spéciaux
    .replace(/\s+/g, '-') // espaces → tirets
    .replace(/-+/g, '-') // tirets multiples → un seul
    .replace(/^-+|-+$/g, ''); // supprime tirets en début/fin

  return clampSlug(slug, maxLength);
}

/** Alphabet de `shortId` : 62 caractères, donc 248 = 62 × 4 est le seuil de rejet. */
const SHORT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SHORT_ID_UNBIASED_LIMIT = 248;
const SHORT_ID_MAX_LENGTH = 64;

/**
 * Source d'aléa unique : `crypto.getRandomValues`. Aucun repli sur
 * `Math.random()` — un identifiant qui doit être imprévisible ne peut pas
 * dépendre d'un générateur prédictible.
 */
function randomBytes(target: Uint8Array): Uint8Array {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error(
      'Aucune source d’aléa cryptographique : globalThis.crypto.getRandomValues est indisponible.'
    );
  }
  return webCrypto.getRandomValues(target);
}

/**
 * 🎲 Génère un ID court aléatoire (8 caractères alphanumériques par défaut).
 *
 * L'aléa vient de `crypto.getRandomValues`, avec rejet des valeurs biaisées :
 * un `Math.random()` ou un simple modulo rendrait certains caractères plus
 * fréquents, donc les identifiants plus devinables.
 *
 * @throws RangeError si `length` sort de [1, 64].
 */
export function shortId(length: number = 8): string {
  if (!Number.isInteger(length) || length < 1 || length > SHORT_ID_MAX_LENGTH) {
    throw new RangeError(`shortId : longueur attendue entre 1 et ${SHORT_ID_MAX_LENGTH}.`);
  }

  let result = '';
  const buffer = new Uint8Array(length * 2);
  while (result.length < length) {
    randomBytes(buffer);
    for (const byte of buffer) {
      if (result.length === length) break;
      if (byte < SHORT_ID_UNBIASED_LIMIT) {
        result += SHORT_ID_ALPHABET[byte % SHORT_ID_ALPHABET.length];
      }
    }
  }
  return result;
}

/**
 * 🆔 Génère un UUID v4 cryptographiquement sûr.
 *
 * `crypto.randomUUID` quand il existe, sinon un v4 construit sur
 * `getRandomValues`. Si aucune source cryptographique n'est disponible, on
 * lève : produire un UUID « v4 » à partir de `Math.random()` donnerait une
 * fausse garantie d'unicité imprévisible.
 */
export function uuid(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = randomBytes(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant RFC 4122

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
