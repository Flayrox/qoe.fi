// =====================================================================
// 🛡️ sanitize-inline-svg — SVG inline injecté dans une page authentifiée
// =====================================================================
// Le QR code d'enrôlement TOTP arrive déjà rendu en SVG par le fournisseur, et
// on l'injecte tel quel : un QR légitime n'a besoin que de `<svg>`, de tracés
// et de rectangles. Tout ce qui permet d'exécuter du code ou de charger une
// ressource distante est refusé en bloc (on préfère ne pas afficher le QR que
// l'afficher dangereusement : le secret et le lien `otpauth://` restent
// disponibles en repli).
//
// Module partagé studio/admin : deux copies de cette liste auraient fini par
// diverger, et la plus faible aurait été la porte d'entrée.
//
// 🔁 F130 — la première version était une **liste noire** d'expressions
//    régulières. Elle laissait passer sept formes réelles : un gestionnaire
//    collé à la balise (`<svg/onload=…>`), un `javascript:` écrit en entité
//    (`&#106;avascript:`, `&colon;`) ou coupé par un blanc, le SMIL qui repose
//    un gestionnaire après coup (`<set attributeName="onmouseover">`), et un
//    lien actif dans le QR. Une liste noire ne peut pas gagner : elle doit
//    deviner chaque déguisement. On inverse donc la charge — **liste blanche**
//    d'éléments et d'attributs, références de caractères décodées avant
//    contrôle, `url()` admis seulement vers une ancre locale.
// =====================================================================

/**
 * Éléments admis : géométrie, texte et définitions locales. Aucun élément
 * actif (`script`, `foreignObject`, `iframe`, `image`, `use`, `a`) et aucune
 * animation SMIL (`animate`, `set`, `discard`) — une animation peut poser un
 * gestionnaire ou changer un `href` **après** le contrôle.
 */
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'rect',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'clippath',
  'mask',
  'symbol',
  'marker',
  'lineargradient',
  'radialgradient',
  'stop',
  'pattern',
]);

/** Attributs de présentation. Jamais `href`/`src`/`style`/`on*`. */
const ALLOWED_ATTRIBUTES = new Set([
  'xmlns',
  'xmlns:xlink',
  'version',
  'viewbox',
  'preserveaspectratio',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'transform',
  'clip-path',
  'clip-rule',
  'mask',
  'id',
  'class',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'patternunits',
  'marker-start',
  'marker-mid',
  'marker-end',
  'overflow',
  'shape-rendering',
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'role',
  'aria-label',
  'aria-hidden',
  'focusable',
]);

/**
 * Références de caractères nommées qui peuvent apparaître dans un SVG.
 * Une référence inconnue est remplacée par U+FFFD : impossible de la laisser
 * traverser le contrôle en esperant que le navigateur la décode autrement.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  nbsp: ' ',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  commat: '@',
  num: '#',
  percnt: '%',
  quest: '?',
  equals: '=',
  semi: ';',
  plus: '+',
  comma: ',',
  period: '.',
  hyphen: '-',
  lowbar: '_',
  verbar: '|',
  grave: '`',
  hat: '^',
  tilde: '~',
  excl: '!',
  dollar: '$',
  ast: '*',
};

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;

/**
 * Décode les références de caractères, plusieurs passes comprises : c'est ce
 * qui rend `&#106;avascript:` et `javascript&colon;` lisibles pour le contrôle.
 * Retourne `null` si un `&` reste ambigu après décodage.
 */
function decodeEntities(input: string): string | null {
  let out = input;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(ENTITY_RE, (match, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      if (body.startsWith('#')) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? '\uFFFD';
    });
    if (next === out) break;
    out = next;
  }
  return ENTITY_RE.test(out) ? null : out;
}

interface TagToken {
  name: string;
  attributes: string;
}

/**
 * Découpe le fragment en balises, en respectant les guillemets des valeurs.
 * Refuse tout ce qui n'est pas une balise simple : commentaire, CDATA,
 * `DOCTYPE`, instruction de traitement XML, balise non fermée.
 */
function tokenize(source: string): TagToken[] | null {
  const tokens: TagToken[] = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) break;

    let cursor = open + 1;
    const marker = source[cursor];
    if (marker === '!' || marker === '?') return null;
    if (marker === '/') cursor += 1;

    const name = /^[A-Za-z][A-Za-z0-9:_-]*/.exec(source.slice(cursor))?.[0];
    if (!name) return null;
    cursor += name.length;

    let attributes = '';
    let quote: string | null = null;
    while (cursor < source.length && source[cursor] !== '>') {
      const char = source[cursor]!;
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      }
      attributes += char;
      cursor += 1;
    }
    if (cursor >= source.length) return null;

    tokens.push({ name, attributes });
    index = cursor + 1;
  }

  return tokens;
}

const ATTRIBUTE_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const FORBIDDEN_SCHEME = /^(?:javascript|vbscript|data|file|blob):/i;
const FORBIDDEN_CALL = /(?:expression|javascript|vbscript)\s*\(/i;

/** Contrôle d'une valeur d'attribut : schéma, appel actif, `url()` distant. */
function attributeValueIsSafe(value: string): boolean {
  // Blancs et caractères de contrôle retirés : `java\nscript:` vaut
  // `javascript:` pour le navigateur.
  const compact = value.replace(/[\u0000-\u0020]+/g, '');
  if (FORBIDDEN_SCHEME.test(compact)) return false;
  if (FORBIDDEN_CALL.test(compact)) return false;
  // `url(...)` n'est admis que vers une ancre du même document (`url(#motif)`).
  if (/url\(/i.test(compact) && !/^url\(["']?#/.test(compact)) return false;
  return true;
}

/**
 * Renvoie le SVG nettoyé, ou `null` s'il contient un contenu actif.
 * Fonction pure : aucun DOM, donc testable en environnement node.
 */
export function sanitizeInlineSvg(svg: string | null | undefined): string | null {
  if (typeof svg !== 'string') return null;
  const trimmed = svg.trim();
  if (trimmed.length === 0) return null;
  // On n'accepte qu'un fragment SVG, jamais une page HTML complète.
  if (!/^<\s*svg\b/i.test(trimmed)) return null;

  const decoded = decodeEntities(trimmed);
  if (decoded === null) return null;

  const tokens = tokenize(decoded);
  if (!tokens || tokens.length === 0) return null;
  if (tokens[0]!.name.toLowerCase() !== 'svg') return null;

  for (const token of tokens) {
    if (!ALLOWED_ELEMENTS.has(token.name.toLowerCase())) return null;
    for (const match of token.attributes.matchAll(ATTRIBUTE_RE)) {
      const name = match[1]!.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name)) return null;
      const value = match[2] ?? match[3] ?? match[4] ?? null;
      if (value !== null && !attributeValueIsSafe(value)) return null;
    }
  }

  return trimmed;
}

/** Vrai si le fragment peut être injecté sans risque. */
export function isSafeInlineSvg(svg: string | null | undefined): boolean {
  return sanitizeInlineSvg(svg) !== null;
}
