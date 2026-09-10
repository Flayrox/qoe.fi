// =====================================================================
// ✂️ paywall/semantic-cut.ts — Découpage propre de teaser pour paywall
// =====================================================================
// Découpe un contenu HTML sans jamais laisser de balise non fermée,
// en s'arrêtant proprement sur une fin de phrase ou de paragraphe.
// =====================================================================

import { countWords } from './metrics';

export interface SemanticCutOptions {
  /** Nombre cible de mots avant coupure (défaut : 200). */
  targetWords?: number;
  /** Si true, s'arrête strictement à la fin du bloc/paragraphe courant. */
  preserveParagraphs?: boolean;
}

export interface SemanticCutResult {
  teaserHtml: string;
  isTruncated: boolean;
  wordCount: number;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Découpe un document HTML de manière sémantique pour générer un teaser
 * sans corrompre la syntaxe HTML ni laisser de balises orphelines.
 */
export function createSemanticTeaser(
  html: string,
  options?: SemanticCutOptions
): SemanticCutResult {
  if (!html || !html.trim()) {
    return { teaserHtml: '', isTruncated: false, wordCount: 0 };
  }

  const targetWords = options?.targetWords ?? 200;
  const totalWords = countWords(html.replace(/<[^>]*>/g, ' '));

  if (totalWords <= targetWords) {
    return { teaserHtml: html, isTruncated: false, wordCount: totalWords };
  }

  const openTags: string[] = [];
  let result = '';
  let wordsSeen = 0;
  let isTruncated = false;

  // Regex pour découper en tokens : balises HTML vs texte brut
  const tokenRegex = /(<[^>]+>)|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [, tagToken, textToken] = match;

    if (tagToken) {
      result += tagToken;

      // Détecte balise ouvrante ou fermante
      const closingMatch = tagToken.match(/^<\/\s*([a-zA-Z0-9-]+)\s*>/);
      const openingMatch = tagToken.match(/^<\s*([a-zA-Z0-9-]+)(\s+[^>]*)?>/);

      if (closingMatch) {
        const tagName = closingMatch[1].toLowerCase();
        // Dépile si match en haut de pile
        const lastIdx = openTags.lastIndexOf(tagName);
        if (lastIdx !== -1) {
          openTags.splice(lastIdx, 1);
        }

        // Si on a atteint le quota de mots et qu'on ferme un paragraphe ou un titre, on coupe ici !
        if (
          wordsSeen >= targetWords &&
          (tagName === 'p' || tagName.startsWith('h') || tagName === 'blockquote')
        ) {
          isTruncated = true;
          break;
        }
      } else if (openingMatch) {
        const tagName = openingMatch[1].toLowerCase();
        const isSelfClosing = tagToken.endsWith('/>') || VOID_TAGS.has(tagName);
        if (!isSelfClosing) {
          openTags.push(tagName);
        }
      }
    } else if (textToken) {
      const wordsInText = countWords(textToken);
      wordsSeen += wordsInText;
      result += textToken;

      // Si on n'est pas en mode préservation stricte de paragraphe et qu'on dépasse le quota
      if (wordsSeen >= targetWords && !options?.preserveParagraphs) {
        // Cherche une ponctuation de fin de phrase
        const sentenceEnd = textToken.search(/[.!?](?:\s|$)/);
        if (sentenceEnd !== -1) {
          // Tronque à la fin de la phrase
          const cutoff = result.length - (textToken.length - sentenceEnd - 1);
          result = result.slice(0, cutoff);
          isTruncated = true;
          break;
        }
      }
    }
  }

  // Ferme toutes les balises encore ouvertes dans l'ordre inverse
  while (openTags.length > 0) {
    const unclosed = openTags.pop();
    if (unclosed) {
      result += `</${unclosed}>`;
    }
  }

  return {
    teaserHtml: result,
    isTruncated,
    wordCount: countWords(result.replace(/<[^>]*>/g, ' ')),
  };
}
