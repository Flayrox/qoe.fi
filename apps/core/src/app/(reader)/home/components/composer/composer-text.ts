import type { ComposerImage, MentionSuggestion, ThreadNode } from './types';

export const CHAR_LIMIT = 500;

export const EMOJI_MAP: Record<string, string> = {
  fire: '🔥',
  heart: '❤️',
  rocket: '🚀',
  sparkles: '✨',
  '100': '💯',
  thumbsup: '👍',
  check: '✅',
  star: '⭐',
  smile: '😊',
  laughing: '😂',
  clap: '👏',
  eyes: '👀',
};

export interface MentionTriggerMatch {
  type: 'profile' | 'tag' | 'emoji';
  query: string;
  start: number;
  end: number;
}

export function getUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/gi;
  return text.match(urlRegex) || [];
}

/**
 * Calcule la longueur pondérée d'une pensée : une URL externe compte pour
 * 20 caractères (règle produit), une URL interne (`/post/` ou `/article/`)
 * est gratuite.
 */
export function calculateCharacters(text: string): number {
  const urls = getUrls(text);
  let len = text.length;
  for (const url of urls) {
    len -= url.length;
    const isInternal = url.includes('/post/') || url.includes('/article/');
    if (!isInternal) {
      len += 20;
    }
  }
  return len;
}

export function detectMentionTrigger(
  text: string,
  selectionStart: number
): MentionTriggerMatch | null {
  const textBeforeCursor = text.substring(0, selectionStart);

  const profileMatch = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
  if (profileMatch) {
    return {
      type: 'profile',
      query: profileMatch[1],
      start: selectionStart - profileMatch[0].length,
      end: selectionStart,
    };
  }

  const tagMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/);
  if (tagMatch) {
    return {
      type: 'tag',
      query: tagMatch[1],
      start: selectionStart - tagMatch[0].length,
      end: selectionStart,
    };
  }

  const emojiMatch = textBeforeCursor.match(/:([a-zA-Z0-9_+-]*)$/);
  if (emojiMatch) {
    return {
      type: 'emoji',
      query: emojiMatch[1],
      start: selectionStart - emojiMatch[0].length,
      end: selectionStart,
    };
  }

  return null;
}

export function formatMentionInsertion(item: MentionSuggestion): string {
  if (item._type === 'profile') {
    const handle = item.username || item.subdomain || item.id.slice(0, 8);
    return `@${handle} `;
  }
  if (item._type === 'tag') {
    return `#${item.value} `;
  }
  return `${item.char} `;
}

/**
 * Un fil est publiable dès que le nœud actif (dans les buffers) OU n'importe
 * quel autre nœud du fil contient du texte ou une image.
 */
export function isThreadPublishable(
  postText: string,
  images: ComposerImage[],
  threadNodes: ThreadNode[],
  activeNodeIndex: number
): boolean {
  if (postText.trim().length > 0 || images.length > 0) return true;
  return threadNodes.some(
    (node, index) =>
      index !== activeNodeIndex && (node.text.trim().length > 0 || node.images.length > 0)
  );
}
