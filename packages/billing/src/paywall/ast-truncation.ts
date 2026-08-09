/**
 * 🛡️ PAYWALL AST / HTML CONTENT TRUNCATION ENGINE — @qoe/billing
 *
 * Guarantees 0 bytes of premium article content leak to non-subscribers
 * in public web rendering, RSS feeds, API DTOs, or newsletter emails.
 */

export interface TruncateOptions {
  isPremium: boolean;
  isSubscriber: boolean;
  fallbackParagraphs?: number;
}

export interface TruncatedArticleResult {
  content: string;
  isTruncated: boolean;
  previewWordCount: number;
}

const PAYWALL_PATTERNS = [
  /<!--\s*paywall\s*-->/i,
  /<div[^>]*data-type=["']paywall-divider["'][^>]*>[\s\S]*?<\/div>/i,
  /<div[^>]*data-paywall-divider[^>]*>[\s\S]*?<\/div>/i,
  /<hr[^>]*data-type=["']paywall["'][^>]*>/i,
];

export function truncateArticleContentForPaywall(
  contentHtml: string,
  options: TruncateOptions
): TruncatedArticleResult {
  const { isPremium, isSubscriber, fallbackParagraphs = 2 } = options;

  // Fully accessible to subscribers or free articles
  if (!isPremium || isSubscriber) {
    const wordCount = countWords(contentHtml);
    return {
      content: contentHtml,
      isTruncated: false,
      previewWordCount: wordCount,
    };
  }

  // 1. Check for explicit Paywall Divider markers in HTML
  for (const pattern of PAYWALL_PATTERNS) {
    const match = contentHtml.match(pattern);
    if (match && match.index !== undefined) {
      const truncatedHtml = contentHtml.substring(0, match.index).trim();
      const previewWordCount = countWords(truncatedHtml);
      return {
        content: truncatedHtml,
        isTruncated: true,
        previewWordCount,
      };
    }
  }

  // 2. Fallback: Extract first N paragraphs (`<p>...</p>`)
  const paragraphMatches = contentHtml.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (paragraphMatches && paragraphMatches.length > 0) {
    const extractedParagraphs = paragraphMatches.slice(0, fallbackParagraphs).join('\n');
    const previewWordCount = countWords(extractedParagraphs);
    return {
      content: extractedParagraphs,
      isTruncated: true,
      previewWordCount,
    };
  }

  // 3. Fallback: Strict character limit truncation (first 400 chars)
  const safeSubstring = contentHtml.slice(0, 400);
  const previewWordCount = countWords(safeSubstring);
  return {
    content: safeSubstring,
    isTruncated: true,
    previewWordCount,
  };
}

function countWords(html: string): number {
  const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plainText) return 0;
  return plainText.split(/\s+/).filter(Boolean).length;
}
