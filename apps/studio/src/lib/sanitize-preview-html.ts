// =====================================================================
// 🛡️ sanitize-preview-html — HTML d'aperçu rendu dans la session studio
// =====================================================================
// L'aperçu lecteur injecte du HTML dans la page du studio, c'est-à-dire dans
// une session authentifiée. Le corps vient de l'éditeur, mais il peut contenir
// du HTML collé depuis l'extérieur : on applique la même liste blanche que le
// lecteur (jamais de script, d'iframe, d'objet ni de gestionnaire inline).
// =====================================================================

import DOMPurify from 'isomorphic-dompurify';

/** Balises autorisées : le corps d'article, rien de plus. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'b',
  'i',
  'u',
  's',
  'del',
  'em',
  'strong',
  'mark',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
  'div',
  'sub',
  'sup',
];

/** Attributs autorisés : liens, images, alignements, repère du paywall. */
const ALLOWED_ATTR = [
  'href',
  'title',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height',
  'class',
  'style',
  'colspan',
  'rowspan',
  'data-type',
];

/**
 * Nettoie le HTML d'aperçu. Les liens gardent `rel="noopener noreferrer"`
 * s'ils s'ouvrent dans un nouvel onglet, et les schémas exotiques
 * (`javascript:`, `data:` hors images) sont retirés.
 */
export function sanitizePreviewHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc', 'formaction'],
    // Les ancres gardent une URL sûre même si l'auteur colle du HTML brut.
    ADD_ATTR: ['rel'],
  });
}
