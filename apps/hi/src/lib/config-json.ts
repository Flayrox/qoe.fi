// =====================================================================
// 🧩 config-json — lecture défensive des JSON de la console (SystemConfig)
// =====================================================================
// La vitrine accepte ses textes depuis la console (`hero_reader_items`,
// `footer_sections`, `creator_hub_tabs`, `comparison_rows`…). Ces champs
// arrivent en JSON libre : `JSON.parse` seul acceptait un objet ou un tableau
// de `null`, et le rendu plantait alors la page d'accueil entière (500 sur la
// seule mauvaise saisie d'un champ d'admin). On sépare donc le parsing de la
// validation de forme, et l'appelant retombe sur son contenu par défaut.
// =====================================================================

/** Tableau JSON, ou tableau vide (absent, invalide, ou pas un tableau). */
export function parseJsonArray(json: string | undefined | null): unknown[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function hasStringFields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => isFilledString(value[key]));
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
