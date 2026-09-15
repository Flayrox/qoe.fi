// =====================================================================
// ⚖️ legal-placeholders — détection des jetons non remplis
// =====================================================================
// Les contenus juridiques embarqués contiennent des jetons du type
// [RAISON SOCIALE], [EMAIL DPO], [HÉBERGEUR PRINCIPAL]… qui doivent
// être remplacés par les valeurs réelles de l'entreprise AVANT
// publication. Publier un document avec un jeton, c'est publier un
// document juridique qui ne nomme personne.
//
// La détection est volontairement LARGE : tout `[TEXTE EN MAJUSCULES]`
// est traité comme un jeton à compléter. Ça attrape aussi les jetons
// futurs ([SIÈGE SOCIAL], [SIRET]…) sans maintenir une liste.
// =====================================================================

/**
 * Jetons du type `[RAISON SOCIALE À COMPLÉTER]` ou `[EMAIL DPO]` :
 * au moins 2 caractères, majoritairement majuscules, tirets, espaces,
 * apostrophes ou points. Exclut les liens markdown `[x](y)` (le `](`
 * n'apparaît pas dans le motif) et le markdown d'image.
 */
const PLACEHOLDER_RE = /\[([A-ZÀ-Þ][A-ZÀ-Þ0-9 &''’\-./]{1,80})\]/g;

/**
 * Faux positifs assumés : sigles d'autorités ou organismes officiels
 * parfois entre crochets dans les textes embarqués, sans être des
 * valeurs à compléter.
 */
const ALLOWED_TOKENS = new Set(['CNIL', 'RGPD']);

export interface LegalPlaceholder {
  /** Jeton brut trouvé, ex. `[EMAIL DPO]`. */
  token: string;
  /** Nom lisible du jeton, ex. `EMAIL DPO`. */
  name: string;
  /** Numéro de ligne (1-indexé) de la première occurrence. */
  line: number;
  /** Nombre d'occurrences dans le texte. */
  count: number;
}

/**
 * Détecte les jetons de remplacement non remplis dans un contenu
 * markdown légal. Retourne une liste dédupliquée, ordonnée par ligne.
 */
export function findLegalPlaceholders(body: string): LegalPlaceholder[] {
  if (!body) return [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\n') lineStarts.push(i + 1);
  }

  const byToken = new Map<string, LegalPlaceholder>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const name = match[1].trim();
    if (ALLOWED_TOKENS.has(name)) continue;
    const token = `[${name}]`;
    const existing = byToken.get(token);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const index = match.index ?? 0;
    let line = 1;
    while (line < lineStarts.length && lineStarts[line] <= index) line++;
    byToken.set(token, { token, name, line, count: 1 });
  }
  return [...byToken.values()].sort((a, b) => a.line - b.line);
}

/** Nombre total de jetons à compléter (0 = document prêt à publier). */
export function countLegalPlaceholders(body: string): number {
  return findLegalPlaceholders(body).reduce((acc, p) => acc + p.count, 0);
}
