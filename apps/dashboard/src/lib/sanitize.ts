/**
 * Surgical sanitization of untrusted HTML strings to prevent Cross-Site Scripting (XSS) (Feature 13).
 * Operates on both Server and Client environments.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return (
    html
      // 1. Strip script tags and their inner content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

      // 2. Strip inline event handlers (e.g., onload, onerror, onclick, etc.)
      .replace(/\s+on\w+\s*=\s*(['"][^']*['"]|["'][^"]*["']|[^\s>]+)/gi, '')

      // 3. Prevent javascript: pseudo-protocol URIs
      .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"')

      // 4. Strip dangerous document embedding tags (iframe, object, embed, applet)
      .replace(/<(iframe|object|embed|applet)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(iframe|object|embed|applet)[^>]*\/?>/gi, '')

      // 5. Block IE expression styles
      .replace(/expression\s*\((.*?)\)/gi, '')
  );
}
