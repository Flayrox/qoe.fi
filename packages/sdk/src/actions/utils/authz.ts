/**
 * 🛡️ Autorisation — codes de refus du garde serveur (apps/api/internal/authz).
 * =====================================================================
 * Module **isomorphe** : importable aussi bien depuis un composant client
 * que depuis une server action. Aucune dépendance serveur (`next/headers`,
 * Supabase…) donc aucun risque de casser un bundle navigateur.
 *
 * Le backend Go répond un `403` avec un motif exploitable :
 *   { error, code, action, level }  (+ en-têtes X-Qoe-Authz-Code / -Level)
 *
 * Le code voyage ensuite jusqu'au client via le `code` de l'erreur
 * (`go-client.ts` → `safeAction` → `ActionResult.error.code`), ce qui permet
 * de proposer le parcours utile — vérifier un facteur fort, demander des
 * droits — plutôt qu'un « accès refusé » sans issue.
 * =====================================================================
 */

/** Codes produits par `apps/api/internal/authz`. */
export const AUTHZ_CODES = [
  'allow',
  'deny_unknown_action',
  'deny_no_session',
  'deny_actor_suspended',
  'deny_no_resource_permission',
  'deny_weak_auth',
  'deny_stale_proof',
  'deny_phone_not_verified',
  'needs_step_up',
  'needs_review',
] as const;

export type AuthzCode = (typeof AUTHZ_CODES)[number];

/** Vrai si la valeur est un code du garde d'autorisation. */
export function isAuthzCode(value: unknown): value is AuthzCode {
  return typeof value === 'string' && (AUTHZ_CODES as readonly string[]).includes(value);
}

/**
 * Refus qui se résolvent par une vérification de facteur fort (TOTP/passkey) :
 * la session n'a pas de preuve forte, elle est trop ancienne, ou le fournisseur
 * l'a élevée par une méthode que qoe.fi n'autorise pas (SMS, OTP e-mail).
 */
const STEP_UP_CODES: readonly string[] = ['needs_step_up', 'deny_weak_auth', 'deny_stale_proof'];

/** Vrai si le refus se débloque en vérifiant un facteur fort. */
export function isStepUpCode(code: unknown): boolean {
  return typeof code === 'string' && STEP_UP_CODES.includes(code);
}

/** Vrai si le refus relève des droits sur la ressource, pas de la session. */
export function isPermissionCode(code: unknown): boolean {
  return code === 'deny_no_resource_permission';
}

/**
 * Réglages de sécurité du compte (enrôlement / vérification d'un facteur).
 * Même base que les autres liens croisés de la plateforme.
 */
export function authzSecurityHref(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qoe.fi';
  return `${base.replace(/\/$/, '')}/settings`;
}

/** Titre et explication affichables pour un code de refus. */
export function authzGuidance(
  code: AuthzCode | null | undefined
): { title: string; description: string } | null {
  switch (code) {
    case 'needs_step_up':
      return {
        title: 'Vérification renforcée requise',
        description:
          "Cette action sensible demande une authentification forte récente (application d'authentification ou passkey).",
      };
    case 'deny_weak_auth':
      return {
        title: 'Méthode de vérification insuffisante',
        description:
          "Un code reçu par SMS ou par e-mail ne compte pas comme authentification forte. Enregistrez une application d'authentification ou une passkey.",
      };
    case 'deny_stale_proof':
      return {
        title: 'Vérification trop ancienne',
        description: 'Revalidez votre facteur pour confirmer cette action.',
      };
    case 'deny_no_resource_permission':
      return {
        title: 'Droits insuffisants',
        description: "Vous n'avez pas les droits requis sur ce média pour cette action.",
      };
    case 'deny_phone_not_verified':
      return {
        title: 'Numéro de téléphone requis',
        description: 'Cette démarche exige un numéro vérifié (contrôle anti-abus).',
      };
    case 'deny_actor_suspended':
      return {
        title: 'Accès suspendu',
        description: 'Cet accès est actuellement restreint. Contactez le support pour un réexamen.',
      };
    case 'deny_no_session':
      return {
        title: 'Session expirée',
        description: 'Reconnectez-vous pour continuer.',
      };
    case 'deny_unknown_action':
      return {
        title: 'Action non autorisée',
        description: "Cette opération n'est pas reconnue par le serveur.",
      };
    case 'needs_review':
      return {
        title: 'Double validation requise',
        description: 'Une seconde personne autorisée doit approuver cette action.',
      };
    default:
      return null;
  }
}

/**
 * Lit le code d'autorisation d'une source quelconque : `ActionResult`
 * (`{ ok: false, error: { code } }`), échec d'action maison
 * (`{ success: false, code }`), ou erreur levée (`{ code }`).
 * Retourne `null` si le code n'est pas un code du garde (ex. `NOT_FOUND`).
 */
export function authzCodeOf(source: unknown): AuthzCode | null {
  if (!source || typeof source !== 'object') return null;
  const value = source as {
    code?: unknown;
    error?: { code?: unknown } | string;
  };
  const candidates: unknown[] = [value.code];
  if (value.error && typeof value.error === 'object') {
    candidates.push(value.error.code);
  }
  for (const candidate of candidates) {
    if (isAuthzCode(candidate)) return candidate;
  }
  return null;
}
