// =====================================================================
// 🔤 Homoglyphs & Normalisation Unicode (NFKC + Leetspeak)
// =====================================================================
// Élimine les tentatives de contournement de modération via :
// 1. Les caractères invisibles / zero-width spaces
// 2. Les homoglyphes (Cyrillique, Grec, pleine chasse vers Latin)
// 3. Le leetspeak (h1tl3r, n4z1, etc.)
// =====================================================================

// Table de correspondance des homoglyphes Cyrilliques et Grecs vers Latin
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillique minuscule & majuscule
  а: 'a',
  А: 'a',
  в: 'b',
  В: 'b',
  е: 'e',
  Е: 'e',
  ё: 'e',
  Ё: 'e',
  ж: 'zh',
  Ж: 'zh',
  з: 'z',
  З: 'z',
  к: 'k',
  К: 'k',
  м: 'm',
  М: 'm',
  н: 'h',
  Н: 'h',
  о: 'o',
  О: 'o',
  р: 'p',
  Р: 'p',
  с: 'c',
  С: 'c',
  т: 't',
  Т: 't',
  у: 'y',
  У: 'y',
  х: 'x',
  Х: 'x',
  і: 'i',
  І: 'i',
  // Grec
  α: 'a',
  Α: 'a',
  β: 'b',
  Β: 'b',
  γ: 'g',
  Γ: 'g',
  ε: 'e',
  Ε: 'e',
  η: 'h',
  Η: 'h',
  ι: 'i',
  Ι: 'i',
  κ: 'k',
  Κ: 'k',
  ο: 'o',
  Ο: 'o',
  ρ: 'p',
  Ρ: 'p',
  τ: 't',
  Τ: 't',
  υ: 'u',
  Υ: 'u',
  χ: 'x',
  Χ: 'x',
  ω: 'w',
  Ω: 'w',
};

// Table de conversion leetspeak basique
const LEETSPEAK_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * 🧼 Nettoie et normalise une chaîne en Unicode NFKC, retire les caractères invisibles,
 * et mappe les homoglyphes évidents vers l'alphabet latin ASCII.
 */
export function normalizeHomoglyphs(input: string): string {
  if (!input) return '';

  // 1. Normalisation Unicode NFKC (décompose les ligatures, caractères de pleine chasse, etc.)
  let str = input.normalize('NFKC');

  // 2. Suppression des caractères invisibles / zero-width / séparateurs
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0\u2060\u202A-\u202E]/g, '');

  // 3. Remplacement des homoglyphes lettre à lettre
  let out = '';
  for (const char of str) {
    out += HOMOGLYPH_MAP[char] ?? char;
  }

  return out;
}

/**
 * 🔡 Décode le leetspeak pour révéler les mots masqués (ex: "h1tl3r" -> "hitler").
 */
export function decodeLeetspeak(input: string): string {
  if (!input) return '';

  const normalized = normalizeHomoglyphs(input).toLowerCase();
  let out = '';
  for (const char of normalized) {
    out += LEETSPEAK_MAP[char] ?? char;
  }
  return out;
}
