// =====================================================================
// 🏷️ facets.ts — Segmentation et extraction de facets (URLs, @mentions, #tags)
// =====================================================================

export const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
export const MENTION_REGEX = /(^|\s)(@[a-zA-Z0-9_.-]+)/g;
export const TAG_REGEX = /(^|\s)(#[a-zA-Z0-9_à-ÿ-]+)/g;

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
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      seg: { kind: 'link', value: m[0], url: m[0] },
    });
  }

  // Mentions
  const mentionRegex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((m = mentionRegex.exec(text)) !== null) {
    const handle = m[2].slice(1);
    matches.push({
      start: m.index + m[1].length,
      end: m.index + m[0].length,
      seg: { kind: 'mention', value: m[2], handle },
    });
  }

  // Hashtags
  const tagRegex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
  while ((m = tagRegex.exec(text)) !== null) {
    const tag = m[2].slice(1);
    matches.push({
      start: m.index + m[1].length,
      end: m.index + m[0].length,
      seg: { kind: 'tag', value: m[2], tag },
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
