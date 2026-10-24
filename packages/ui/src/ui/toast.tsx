'use client';

import {
  toastQueue,
  Toaster,
  type ToastAction,
  type ToastContent,
  type ToastVariant,
} from '../primitives/toast/toast';

// =====================================================================
// 🔔 toast.* — API d'appel des notifications
// =====================================================================
// 📖 Le rendu et l'accessibilité vivent dans `primitives/toast` (react-aria).
//    Ce module n'est plus qu'un adaptateur : il garde l'API historique
//    `toast.success('Fait', { description })` utilisée par ~30 écrans, et
//    traduit les options vers la file react-aria.
//
// 🎯 Pourquoi garder l'API : les appelants n'ont pas à connaître la file.
//    Le jour où l'on change de moteur, un seul fichier bouge.
// =====================================================================

export interface ToastOptions {
  description?: string;
  /** Millisecondes. Défaut : 8 s pour une erreur, 5 s sinon. */
  duration?: number;
  action?: ToastAction;
}

/** Délai par défaut : une erreur se lit, un succès se survole. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  error: 8000,
  warning: 6000,
  info: 5000,
  success: 5000,
  message: 5000,
};

function push(variant: ToastVariant, title: string, options: ToastOptions = {}) {
  const content: ToastContent = {
    variant,
    title,
    description: options.description,
    action: options.action,
  };

  return toastQueue.add(content, {
    timeout: options.duration ?? DEFAULT_DURATION[variant],
  });
}

/** Ferme une notification par identifiant, ou toutes si `id` est omis. */
function dismiss(id?: string) {
  if (id) toastQueue.close(id);
  else toastQueue.clear();
}

/**
 * API compatible sonner pour les appels existants :
 *   toast.success('Fait') / toast.error(msg, { description }) / …
 */
const toast = Object.assign(
  (title: string, options?: ToastOptions) => push('message', title, options),
  {
    message: (title: string, options?: ToastOptions) => push('message', title, options),
    success: (title: string, options?: ToastOptions) => push('success', title, options),
    error: (title: string, options?: ToastOptions) => push('error', title, options),
    info: (title: string, options?: ToastOptions) => push('info', title, options),
    warning: (title: string, options?: ToastOptions) => push('warning', title, options),
    dismiss,
  }
);

export { toast, dismiss as toastDismiss, Toaster, toastQueue };
export type { ToastAction, ToastContent, ToastVariant };
export type { ToasterProps } from '../primitives/toast/toast';
