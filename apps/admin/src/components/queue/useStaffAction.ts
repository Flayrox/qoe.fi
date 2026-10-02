'use client';

import { useState, useCallback } from 'react';
import { toast } from '@qoe/ui/toast';
import {
  attemptWithStepUp,
  isFailure,
  notifyActionFailure,
  readMessage,
} from '@/lib/authz-feedback';

// Exécuteur d'action staff (lot 2) : loading par identifiant + toasts +
// extraction du message d'erreur — le boilerplate `run` recopié dans chaque
// file (reports, abuse, appeals, incidents, support).
// Usage : const { loadingId, run } = useStaffAction<string>();
//   await run(item.id, () => decideXAction({...}), { ok: 'Fait', });
// `ok` accepte une chaîne ou une fonction du résultat (message variable).
//
// Depuis la Phase 3, `run` est STEP-UP CONSCIENT : quand le garde de la console
// refuse par manque de preuve forte récente (`needs_step_up`) ou parce que la
// session a été élevée par une méthode non autorisée (`deny_weak_auth`), la
// vérification d'un facteur est proposée puis l'action est REJOUÉE telle quelle
// — mêmes arguments, donc aucune saisie perdue. Les files de modération en
// héritent sans rien changer.
export function useStaffAction<TId extends string | number>() {
  const [loadingId, setLoadingId] = useState<TId | null>(null);

  const run = useCallback(
    async <TRes extends { ok: boolean; error?: unknown; code?: string }>(
      id: TId,
      fn: () => Promise<TRes>,
      messages: { ok: string | ((res: TRes) => string) }
    ): Promise<TRes | null> => {
      setLoadingId(id);
      try {
        const res = await attemptWithStepUp(fn);
        if (!isFailure(res)) {
          toast.success(typeof messages.ok === 'function' ? messages.ok(res) : messages.ok);
          return res;
        }
        // Échec : on notifie et on rend `null` — contrat historique de `run`,
        // que les appelants testent directement (`if (res) …`).
        notifyActionFailure(res, readMessage(res) ?? 'Action impossible');
        return null;
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Action impossible');
        return null;
      } finally {
        setLoadingId(null);
      }
    },
    []
  );

  return { loadingId, run };
}

// errorMessage extrait un message lisible d'un résultat safeAction (pour
// les cas où l'appelant gère lui-même le toast).
export function actionErrorMessage(res: { error?: unknown }): string {
  if (typeof res.error === 'string') return res.error;
  return (res.error as { message?: string } | undefined)?.message ?? 'Action impossible';
}
