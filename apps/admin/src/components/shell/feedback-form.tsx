'use client';

// =====================================================================
// 📨 FeedbackForm — un `<form action>` qui dit quand ça a échoué
// =====================================================================
// 📖 `<form action={serverAction}>` avale le résultat : une action qui renvoie
//    `{ success: false, error }` ne produisait **rien** à l'écran, l'ancien
//    état se réaffichant comme si le clic n'avait pas eu lieu (R165, écran
//    `/admin/config`).
//
// 🎯 Le formulaire appelle lui-même l'action, annonce le refus avec son motif,
//    annonce le succès, puis revalide la page (`router.refresh()`) pour relire
//    la vérité serveur. Aucune action muette : `success: false` sans motif
//    reste un refus annoncé.
// =====================================================================

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@qoe/ui/toast';

/** Résultat d'une server action de la console : succès ou refus motivé. */
export interface FormActionResult {
  success: boolean;
  error?: string;
}

export interface FeedbackFormProps {
  /** Server action : reçoit les champs du formulaire et rend son verdict. */
  action: (formData: FormData) => Promise<FormActionResult>;
  /** Message de succès (le refus, lui, vient de l'action). */
  successMessage: string;
  /** Revalide la page après un succès. Défaut `true`. */
  refreshOnSuccess?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function FeedbackForm({
  action,
  successMessage,
  refreshOnSuccess = true,
  id,
  className,
  children,
}: FeedbackFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.success) {
        toast.error(result.error ?? 'Action refusée');
        return;
      }
      toast.success(successMessage);
      if (refreshOnSuccess) router.refresh();
    });
  };

  return (
    <form id={id} className={className} onSubmit={submit} aria-busy={pending}>
      {children}
    </form>
  );
}
