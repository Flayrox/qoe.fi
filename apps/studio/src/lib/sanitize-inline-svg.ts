// =====================================================================
// 🛡️ sanitize-inline-svg — ré-export du garde partagé
// =====================================================================
// Le studio et l'admin affichent le même QR d'enrôlement TOTP : la liste de
// refus vit désormais dans @qoe/ui/security. Ce fichier reste l'import local
// du studio (chemins `@/lib/...` déjà utilisés par les tests et les écrans).
// =====================================================================

export { isSafeInlineSvg, sanitizeInlineSvg } from '@qoe/ui/security';
