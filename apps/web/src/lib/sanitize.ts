import DOMPurify from "isomorphic-dompurify"

/**
 * Robust AST DOM sanitization of untrusted HTML strings to prevent Cross-Site Scripting (XSS).
 * Operates on both Server and Client environments.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ""

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "em", "strong", "a", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "code", "pre", "img", "figure", "figcaption",
      "hr", "div", "span", "mark", "section"
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "class", "style",
      "data-type", "data-annotation-note", "data-highlight-id", "data-highlight-text"
    ],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  })
}
