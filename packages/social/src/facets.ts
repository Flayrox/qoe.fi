// =====================================================================
// 🏷️ facets.ts — Segmentation et extraction de facets (URLs, @mentions, #tags)
// =====================================================================

export const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
// Frontière = "pas un caractère de handle" : une mention collée à `(` ou `«`
// doit être reconnue comme dans `Merci (@alice)`, alors qu'un `@` précédé d'un
// caractère de handle (`alice@qoe.fi`) reste une adresse e-mail.
//
// ⚠️ Parité stricte avec `apps/api/internal/antispam/antispam.go` :
// `(?:^|[^a-zA-Z0-9._%+-])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,39})`. Sans la règle
// du premier caractère, `@.alice` produisait un profil `.alice` (404) alors
// que Go ne notifie personne ; sans la borne de 40, la longueur divergeait.
export const MENTION_REGEX = /(^|[^a-zA-Z0-9_.%+@-])(@[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,39})/g;
// Même logique pour les hashtags : `(#tech)` et `«#tech»` sont des tags, un
// fragment d'URL (`/tag#tech`) n'en est pas un.
export const TAG_REGEX = /(^|[^a-zA-Z0-9_à-ÿ-])(#[a-zA-Z0-9_à-ÿ-]+)/g;

/** Ponctuation qui termine une phrase et ne fait jamais partie d'un lien. */
const URL_TRAILING_PUNCTUATION = /[.,;:!?…"'’«»”\]]/;

/**
 * Longueur utile d'une URL : coupe la ponctuation finale et les parenthèses
 * non équilibrées (`(voir https://qoe.fi/a)`), sans casser les URLs qui en
 * contiennent légitimement (`…/Qoe_(marque)`).
 */
function trimmedUrlLength(url: string): number {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if (URL_TRAILING_PUNCTUATION.test(last)) {
      end -= 1;
      continue;
    }
    if (last === ')') {
      const opens = (url.slice(0, end).match(/\(/g) ?? []).length;
      const closes = (url.slice(0, end).match(/\)/g) ?? []).length;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return end;
}

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; url: string }
  | { kind: 'mention'; value: string; handle: string }
  | { kind: 'tag'; value: string; tag: string };

/**
 * Détecte les URLs, mentions et hashtags dans un texte et le segmente en tokens ordonnés.
 * Priorise les URLs sur les mentions et hashtags en cas de chevauchement.
 */
export function segmentText(text: string): TextSegment[] {
  if (!text) return [];

  const matches: { start: number; end: number; seg: TextSegment }[] = [];

  // URLs
  const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(text)) !== null) {
    const end = trimmedUrlLength(m[0]);
    const url = m[0].slice(0, end);
    // "https://" seul : rien à ouvrir, on laisse le texte tel quel.
    if (url.length <= 'https://'.length) continue;
    matches.push({
      start: m.index,
      end: m.index + end,
      seg: { kind: 'link', value: url, url },
    });
  }

  // Mentions — un handle ne finit ni par `.` ni par `-` : `@alice.` en fin de
  // phrase donnait un profil `alice.` (404), le point restant dans le texte.
  const mentionRegex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((m = mentionRegex.exec(text)) !== null) {
    const raw = m[2].replace(/[.-]+$/, '');
    if (raw.length < 2) continue;
    const start = m.index + m[1].length;
    matches.push({
      start,
      end: start + raw.length,
      seg: { kind: 'mention', value: raw, handle: raw.slice(1) },
    });
  }

  // Hashtags — même règle pour le tiret final (`#tech-`).
  const tagRegex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
  while ((m = tagRegex.exec(text)) !== null) {
    const raw = m[2].replace(/-+$/, '');
    if (raw.length < 2) continue;
    const start = m.index + m[1].length;
    matches.push({
      start,
      end: start + raw.length,
      seg: { kind: 'tag', value: raw, tag: raw.slice(1) },
    });
  }

  if (matches.length === 0) {
    return [{ kind: 'text', value: text }];
  }

  // Trier par position de début, puis par longueur décroissante en cas d'égalité
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) {
      // Ignorer les fragments chevauchés
      continue;
    }
    if (match.start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, match.start) });
    }
    segments.push(match.seg);
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }

  return segments;
}

/**
 * Extrait la liste unique des mentions sans le symbole '@'.
 */
export function extractMentions(text: string): string[] {
  const segments = segmentText(text);
  const mentions = segments
    .filter((s): s is TextSegment & { kind: 'mention' } => s.kind === 'mention')
    .map((s) => s.handle);
  return Array.from(new Set(mentions));
}

/**
 * Extrait la liste unique des hashtags sans le symbole '#'.
 */
export function extractHashtags(text: string): string[] {
  const segments = segmentText(text);
  const tags = segments
    .filter((s): s is TextSegment & { kind: 'tag' } => s.kind === 'tag')
    .map((s) => s.tag);
  return Array.from(new Set(tags));
}

/**
 * Extrait la liste unique des URLs trouvées dans le texte.
 */
export function extractUrls(text: string): string[] {
  const segments = segmentText(text);
  const urls = segments
    .filter((s): s is TextSegment & { kind: 'link' } => s.kind === 'link')
    .map((s) => s.url);
  return Array.from(new Set(urls));
}
