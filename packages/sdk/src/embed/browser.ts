// =====================================================================
// 📨 Embed newsletter qoe.fi — couche navigateur (fiche 02)
// =====================================================================
// Fine pellicule au-dessus de ./embed (logique pure testée) : fetch et
// popup uniquement. Importée par les sites tiers (vanilla ou React) ; ne
// dépend d'aucun framework.
//
// Garanties reprises de la fiche :
// - parcours e-mail : réponse neutre, jamais d'état `active` imposé ;
// - parcours compte : la popup lit la session qoe.fi, le site tiers ne reçoit
//   qu'un résultat minimal, jamais session, token ni email ;
// - popup bloquée : détection explicite, repli par redirection à l'appelant
//   (jamais de navigation silencieuse vers une URL non validée).
// =====================================================================

import {
  EmbedValidationError,
  buildSubscribePopupUrl,
  buildSubscribeRequest,
  isTrustedPopupOrigin,
  parsePopupResult,
  type QoeSubscribePopupInput,
  type QoeSubscribeResult,
} from './embed';

export type { QoeSubscribeResult };
export { EmbedValidationError };

/**
 * Envoie une demande d'inscription par e-mail (parcours 1). Résout dès que le
 * backend a enregistré la demande — l'abonnement reste en attente jusqu'au
 * clic sur le lien envoyé. Rejette en EmbedValidationError avant tout réseau
 * si l'entrée est invalide, sinon en Error avec le message serveur.
 */
export async function subscribeEmail(input: {
  apiBase: string;
  publication: string;
  email: string;
  locale?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const req = buildSubscribeRequest(input);
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: input.signal,
    });
  } catch (err) {
    throw new Error(
      `Inscription impossible pour le moment (${err instanceof Error ? err.message : 'réseau'}).`
    );
  }
  if (!res.ok) {
    let message = 'Inscription impossible pour le moment.';
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data?.error === 'string' && data.error) message = data.error;
    } catch {
      // Corps illisible : message générique (ne jamais fuiter le brut).
    }
    throw new Error(message);
  }
}

export interface QoeSubscribePopupOptions extends QoeSubscribePopupInput {
  /** Largeur/hauteur de la popup (défaut 480×640, centrée). */
  width?: number;
  height?: number;
  /** Délai max d'attente du résultat (défaut 10 min, 0 = infini). */
  timeoutMs?: number;
}

export type PopupOutcome = { result: QoeSubscribeResult } | { popupBlocked: true };

/**
 * Ouvre le parcours « S'abonner avec qoe.fi » (parcours 2) et attend le
 * résultat minimal de la popup.
 *
 * - L'origine de chaque message est vérifiée contre `appBase` ; tout le
 *   reste est ignoré (deux fenêtres ne communiquent que sur origine prouvée).
 * - Seules les formes `{ ok: true }` et `{ cancelled: true }` sont acceptées ;
 *   session, token ou email éventuellement présents sont rejetés.
 * - Si la popup est bloquée : `{ popupBlocked: true }` — à l'appelant de
 *   rediriger explicitement (ex. `location.assign(url)` sur clic), jamais de
 *   navigation automatique.
 */
export function openQoeSubscribePopup(options: QoeSubscribePopupOptions): Promise<PopupOutcome> {
  const url = buildSubscribePopupUrl(options);
  const width = options.width ?? 480;
  const height = options.height ?? 640;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  const left = Math.max(0, (window.screenX || 0) + ((window.outerWidth || 800) - width) / 2);
  const top = Math.max(0, (window.screenY || 0) + ((window.outerHeight || 600) - height) / 2);
  const popup = window.open(
    url,
    'qoe-subscribe',
    `width=${width},height=${height},left=${left},top=${top},popup=yes`
  );
  if (!popup || popup.closed) {
    return Promise.resolve({ popupBlocked: true });
  }

  return new Promise<PopupOutcome>((resolve) => {
    let done = false;
    const finish = (outcome: PopupOutcome) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(watchdog);
      if (timer !== undefined) window.clearTimeout(timer);
      try {
        popup.close();
      } catch {
        // Popup déjà fermée par l'utilisateur : rien à faire.
      }
      resolve(outcome);
    };
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedPopupOrigin(event.origin, options.appBase)) return;
      const parsed = parsePopupResult(event.data);
      if (parsed) finish({ result: parsed });
    };
    // Fermeture manuelle = annulation (pas de résultat fantôme).
    const watchdog = window.setInterval(() => {
      if (popup.closed) finish({ result: { cancelled: true } });
    }, 500);
    const timer =
      timeoutMs > 0
        ? window.setTimeout(() => finish({ result: { cancelled: true } }), timeoutMs)
        : undefined;
    window.addEventListener('message', onMessage);
  });
}
