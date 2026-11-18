// =====================================================================
// 🛡️ Helper anti-Open-Redirect (Inspiré des patterns Ghost & Cal.com)
// =====================================================================

const DEFAULT_ALLOWED_DOMAINS = ['lvh.me', 'qoe.test', 'qoe.fi', 'localhost', '127.0.0.1'];

/**
 * Caractères de contrôle bruts ou encodés : un `CRLF` dans un chemin recopié
 * dans un en-tête `Location` permet une injection d'en-tête (cookie ou
 * redirection ajoutés par un proxy).
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

/**
 * Validates and sanitizes a target redirect URL to prevent Open Redirect vulnerabilities.
 * Returns a safe relative or absolute URL string belonging strictly to allowed domains.
 */
export function getSafeRedirectUrl(
  targetUrl: string | null | undefined,
  fallbackPath: string = '/home',
  customAllowedDomains?: string[]
): string {
  if (!targetUrl) return fallbackPath;
  // Contrôle AVANT `trim()` : un caractère de contrôle n'a aucune raison
  // d'être dans une cible de redirection, même en tête ou en queue.
  if (CONTROL_CHARS.test(targetUrl)) return fallbackPath;
  const trimmed = targetUrl.trim();
  if (!trimmed) return fallbackPath;

  const allowedDomains = customAllowedDomains || DEFAULT_ALLOWED_DOMAINS;

  // Relative path validation (e.g. /home, /library, /settings?tab=general)
  if (trimmed.startsWith('/')) {
    // Block protocol-relative URLs (//evil.com) and backslash tricks (/\evil.com)
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('/%5C')) {
      return fallbackPath;
    }
    // Block URLs that try to specify a scheme like /http:evil.com
    if (/^\/[a-z0-9]+:/i.test(trimmed)) {
      return fallbackPath;
    }
    return trimmed;
  }

  // Absolute URL validation
  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    const isAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (isAllowed) {
      return parsed.href;
    }
  } catch {
    // Invalid URL structure
  }

  return fallbackPath;
}
