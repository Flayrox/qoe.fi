// =====================================================================
// 🛡️ Identifiants protégés — lecture et écriture du champ texte
// =====================================================================
// Le champ « Protected identifiers » de /admin/config est une liste libre :
// un pseudo ou un sous-domaine par ligne. Deux conversions le relient au
// formulaire : le texte saisi → la liste envoyée à l'API, et la liste lue en
// base → le texte affiché. Elles vivaient en ligne dans le composant avec des
// séquences échappées une fois de trop : le séparateur était la suite de
// caractères « \ » + « n », pas un retour à la ligne. La liste s'affichait donc
// sur une seule ligne et, à l'enregistrement, elle devenait UN identifiant
// (« admin » se réduisait même à « admi », le « n » étant avalé comme
// séparateur).
// =====================================================================

/** Sépare le texte saisi : retours à la ligne, virgules, espaces et tabulations. */
export function splitReservedIdentifiers(raw: string): string[] {
  return raw
    .split(/[\n,\r\t ]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Formate une liste pour le champ texte : un identifiant par ligne. */
export function formatReservedIdentifiers(values: readonly string[]): string {
  return values.join('\n');
}
