'use client';

// =====================================================================
// 🛡️ Retour d'un refus d'autorisation (console d'administration)
// =====================================================================
// Le garde de la console refuse un acte en expliquant pourquoi : preuve forte
// absente ou trop ancienne (`needs_step_up`), méthode de vérification
// insuffisante (`deny_weak_auth` — un code SMS ne compte pas), capacité
// manquante (`deny_missing_capability`), double validation requise
// (`needs_review`)…
//
// Sans ce module, un membre du staff recevait « accès refusé » sans issue
// après avoir rempli un formulaire. Ici : on explique le refus, et quand il se
// débloque par une vérification de facteur, on la propose **puis on rejoue
// l'action** — sans perte de saisie, puisqu'on rejoue exactement la même
// fonction, avec les mêmes arguments.
//
// Les codes et les textes viennent du SDK (`@qoe/sdk/actions/utils/authz`),
// partagés avec le Studio : un seul vocabulaire de refus dans toute la
// plateforme, et la liste reste verrouillée par les tests du SDK.
// =====================================================================

import { toast } from '@qoe/ui/toast';
import {
  authzCodeOf,
  authzGuidance,
  isStepUpCode,
  type AuthzCode,
} from '@qoe/sdk/actions/utils/authz';
import { requestStepUp } from '@/components/security/step-up';

/** Résultat d'action de la console : `{ ok }` ou `{ success }`, plus `code`. */
export interface ActionOutcome {
  ok?: boolean;
  success?: boolean;
  error?: unknown;
  code?: string;
  level?: string;
}

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

/** Vrai si le résultat d'une server-action est un échec. */
export function isFailure(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as ActionOutcome;
  if (typeof value.ok === 'boolean') return value.ok === false;
  if (typeof value.success === 'boolean') return value.success === false;
  return false;
}

/**
 * Affiche l'échec d'une action. Un refus du garde porte un titre et une
 * explication issus du vocabulaire partagé ; le reste garde le message serveur.
 */
export function notifyActionFailure(failure: unknown, fallback: string): void {
  const code = authzCodeOf(failure);
  const message = readMessage(failure);

  if (isStepUpCode(code)) {
    const guidance = authzGuidance(code);
    toast.error(guidance?.title ?? 'Vérification renforcée requise', {
      description:
        guidance?.description ?? 'Une vérification renforcée est nécessaire pour cet acte.',
      duration: 10000,
    });
    return;
  }

  if (code === 'needs_review') {
    // Double validation (quorum N3) : ce n'est pas à cette personne de refaire
    // une vérification, c'est à une seconde d'approuver.
    const guidance = authzGuidance(code);
    toast.error(guidance?.title ?? 'Double validation requise', {
      description: guidance?.description ?? undefined,
      duration: 10000,
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

/**
 * Exécute un acte sensible et, si le refus demande un step-up, propose la
 * vérification d'un facteur fort puis **rejoue automatiquement** l'action.
 *
 * Le rejeu appelle à nouveau `run()` — la même closure, donc les mêmes
 * arguments : c'est ce qui garantit qu'aucune saisie n'est perdue. Toute autre
 * erreur (capacité manquante, session expirée, erreur métier) est rendue telle
 * quelle à l'appelant, qui l'affiche sans rejeu.
 *
 * Cette fonction NE notifie pas : le résultat final (rejoué ou non) revient à
 * l'appelant, qui seul sait quel message convient. Deux toasts pour un même
 * refus seraient un bruit, pas une explication.
 */
export async function attemptWithStepUp<T>(
  run: () => Promise<T>,
  options: { reason?: string } = {}
): Promise<T> {
  const first = await run();
  if (!isFailure(first)) return first;

  const code = authzCodeOf(first);
  if (!isStepUpCode(code)) return first;

  // Annulé ou aucun facteur compatible : on rend le refus d'origine, que
  // l'appelant expliquera (le parcours reste proposé au prochain essai).
  const verified = await requestStepUp(options.reason ?? authzGuidance(code)?.description);
  if (!verified) return first;

  return run();
}

/** Code d'autorisation transporté par un résultat d'action (ou `null`). */
export function outcomeCode(result: unknown): AuthzCode | null {
  return authzCodeOf(result);
}
