// =====================================================================
// 🛡️ security-headers — en-têtes de défense en profondeur (studio)
// =====================================================================
// Caddy pose déjà HSTS et X-Frame-Options en production, mais l'app doit
// rester protégée si elle est servie autrement (preview Vercel/Docker nu,
// tunnel local, test E2E). Ces en-têtes sont donc posés ici aussi.
//
// La CSP reste en `Report-Only` : Next injecte des scripts inline et le
// runtime de dev a besoin d'`unsafe-eval`. On l'observe avant de la rendre
// bloquante — voir docs/SECURITY-PLAN.md.
// =====================================================================

export interface SecurityHeader {
  key: string;
  value: string;
}

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https: wss:",
].join('; ');

/**
 * En-têtes appliqués à toutes les réponses du studio.
 * `same-origin-allow-popups` garde les retours OAuth (Supabase) fonctionnels
 * tout en isolant la fenêtre de l'application.
 */
export function studioSecurityHeaders(): SecurityHeader[] {
  return [
    { key: 'Supports-Loading-Mode', value: 'credentialed-prerender' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  ];
}
