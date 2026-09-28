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
