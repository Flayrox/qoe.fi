// =====================================================================
// 🛡️ sanitize-article-html — liste blanche du corps d'article
// =====================================================================
// Un seul assainisseur pour tous les endroits qui injectent du HTML de
// contenu dans une page : lecteur (corps d'article, chapitre d'ebook),
// annotations, aperçu studio et blocs de template. Avant ce module chaque
// surface avait sa propre liste (ou aucune) : une liste plus permissive dans
// un écran devenait la porte d'entrée de tout le produit.
//
// Le profil de risque est identique partout : du HTML éditorial rendu dans une
// session authentifiée. On autorise donc le balisage de lecture, jamais ce qui
// exécute du code ou charge une ressource distante non contrôlée.
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

/**
 * Attributs autorisés. `style` reste toléré pour les alignements produits par
 * l'éditeur : DOMPurify retire les valeurs dangereuses d'URL, mais une règle
 * CSS exotique ne peut pas exécuter de script dans un navigateur moderne.
 */
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
  'id',
  'style',
  'loading',
  'colspan',
  'rowspan',
  'data-type',
  'data-indent',
  'data-drop-cap',
  'data-annotation-note',
  'data-is-official',
];

/**
 * Nettoie le HTML de contenu. Fonction pure côté API : un HTML vide renvoie une
 * chaîne vide (jamais `undefined`, qui produirait « undefined » à l'écran).
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Les data-* utiles sont listés explicitement : pas de passe-droit global.
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'link',
      'meta',
      'base',
    ],
    // Vecteurs de chargement de ressource non contrôlée : `srcset`, `poster`,
    // `background` et les attributs de formulaire sont retirés. Les images
    // http(s) restent autorisées — ce sont les illustrations de l'article —
    // mais aucun attribut ne permet de charger une ressource arbitraire hors
    // `img[src]`.
    FORBID_ATTR: [
      'srcdoc',
      'formaction',
      'action',
      'srcset',
      'poster',
      'background',
      'xlink:href',
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
    ],
    ADD_ATTR: ['rel'],
  });
}
