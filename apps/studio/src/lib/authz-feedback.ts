'use client';

// =====================================================================
// 🛡️ Retour d'un refus d'autorisation (Studio)
// =====================================================================
// Le garde Go (apps/api/internal/authz) refuse une action sensible en
// expliquant pourquoi : preuve forte absente (needs_step_up), méthode de
// vérification insuffisante (deny_weak_auth, typiquement un code SMS),
// preuve trop ancienne, droits média manquants, numéro non vérifié…
//
// Sans ce module, l'utilisateur recevait un « accès refusé » sans issue. Ici
// on affiche le motif ET, quand le refus se débloque par une vérification de
// facteur, on propose le parcours correspondant (réglages de sécurité du
// compte, où s'enregistre et se vérifie le TOTP ou la passkey).
// =====================================================================

import { toast } from '@qoe/ui/toast';
import {
  authzCodeOf,
  authzGuidance,
  authzSecurityHref,
  isStepUpCode,
} from '@qoe/sdk/actions/utils/authz';
import { requestStepUp } from '@/features/security/step-up';

/** Extrait un message lisible d'une erreur, d'un `ActionResult` ou d'un échec maison. */
export function readMessage(source: unknown): string | null {
  if (!source || typeof source !== 'object') return null;
  const value = source as { error?: unknown; message?: unknown };
  if (typeof value.message === 'string' && value.message) return value.message;
  if (typeof value.error === 'string' && value.error) return value.error;
  if (value.error && typeof value.error === 'object') {
    const nested = (value.error as { message?: unknown }).message;
    if (typeof nested === 'string' && nested) return nested;
  }
  return null;
}

/**
 * Affiche l'échec d'une action et, quand le refus vient du garde
 * d'autorisation, propose le parcours qui le débloque.
 *
 * @param failure `{ error, code }`, `{ ok:false, error:{ code, message } }` ou `Error`
 * @param fallback message générique si le serveur n'en fournit aucun
 */
export function notifyActionFailure(failure: unknown, fallback: string): void {
  const code = authzCodeOf(failure);
  const message = readMessage(failure);

  if (isStepUpCode(code)) {
    const guidance = authzGuidance(code);
    toast.error(guidance?.title ?? 'Vérification renforcée requise', {
      description:
        guidance?.description ?? 'Une vérification renforcée est nécessaire pour cette action.',
      // 12 s : le temps de lire et de cliquer sur l'action proposée.
      duration: 12000,
      action: {
        label: 'Vérifier un facteur',
        onClick: () => {
          window.open(authzSecurityHref(), '_blank', 'noopener,noreferrer');
        },
      },
    });
    return;
  }

  if (code) {
    const guidance = authzGuidance(code);
    toast.error(guidance?.title ?? message ?? fallback, {
      description: guidance?.description ?? message ?? undefined,
      duration: 9000,
    });
    return;
  }

  toast.error(message ?? fallback);
}

/** Une action a-t-elle échoué ? Couvre `ActionResult` et les échecs maison. */
function isFailure(result: unknown, custom?: (result: unknown) => boolean): boolean {
  if (custom) return custom(result);
  if (!result || typeof result !== 'object') return false;
  const value = result as { ok?: unknown; success?: unknown };
  if (typeof value.ok === 'boolean') return value.ok === false;
  if (typeof value.success === 'boolean') return value.success === false;
  return false;
}

/**
 * Exécute une action sensible et, si le refus demande un step-up, propose la
 * vérification d'un facteur fort puis **rejoue automatiquement** l'action une
 * fois la session élevée.
 *
 * C'est le complément de `notifyActionFailure` : plus besoin de quitter sa
 * page, de retrouver les réglages de sécurité et de relancer l'action à la
 * main. Le jeton obtenu côté navigateur porte `aal2` et un `amr` horodaté, ce
 * que le garde Go accepte pour une action récente (N2).
 *
 * Toute autre erreur (droits manquants, session expirée, erreur métier) est
 * affichée sans rejeu.
 */
export async function attemptWithStepUp<T>(
  run: () => Promise<T>,
  options: { fallback: string; failed?: (result: unknown) => boolean; reason?: string }
): Promise<T> {
  const first = await run();
  if (!isFailure(first, options.failed)) return first;

  const code = authzCodeOf(first);
  if (!isStepUpCode(code)) {
    notifyActionFailure(first, options.fallback);
    return first;
  }

  const verified = await requestStepUp(options.reason ?? authzGuidance(code)?.description);
  if (!verified) {
    // Annulé ou aucun facteur : on explique pourquoi l'action reste bloquée.
    notifyActionFailure(first, options.fallback);
    return first;
  }

  const retried = await run();
  if (isFailure(retried, options.failed)) {
    notifyActionFailure(retried, options.fallback);
  }
  return retried;
}
