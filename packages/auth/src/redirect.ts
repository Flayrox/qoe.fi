// =====================================================================
// 🔒 redirect.ts — validation des cibles de retour (`?redirect=`)
// =====================================================================
// 📖 Module pur (aucune dépendance Next) pour être testable en isolation :
//    une cible de retour n'est acceptée que si elle appartient à l'origine
//    courante. Un `Referer` externe ne doit pas transformer /login en
//    redirection ouverte.
// =====================================================================

/**
 * Vrai si `candidate` est une URL absolue de même origine que `origin`.
 */
export function isSafeRedirectTarget(candidate: string, origin: string): boolean {
  try {
    const target = new URL(candidate);
    const base = new URL(origin);
    return target.protocol === base.protocol && target.host === base.host;
  } catch {
    return false;
  }
}
