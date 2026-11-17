// =====================================================================
// 🎛️ workspace-cookie — cookie d'espace actif côté réponse HTTP
// =====================================================================
// Le studio pose ce cookie depuis deux endroits (middleware pour un lien
// profond `?ws=`, composants pour une bascule manuelle). Il n'est pas
// `httpOnly` : l'en-tête de bascule le relit. En revanche il doit être
// `secure` en production — sinon un accès HTTP le ferait voyager en clair.
// =====================================================================

import { serializeWorkspaceCookie, WORKSPACE_COOKIE, type WorkspaceRef } from '@qoe/sdk/workspace';

export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

export interface WorkspaceCookieDescriptor {
  name: string;
  value: string;
  options: {
    path: string;
    maxAge: number;
    sameSite: 'lax';
    secure: boolean;
    httpOnly: boolean;
  };
}

/** Décrit le cookie d'espace actif pour une réponse Next. */
export function workspaceCookie(
  ref: WorkspaceRef,
  isProduction: boolean
): WorkspaceCookieDescriptor {
  return {
    name: WORKSPACE_COOKIE,
    value: serializeWorkspaceCookie({ type: ref.type, id: ref.id }),
    options: {
      path: '/',
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: isProduction,
      // Lu par l'en-tête de bascule : ce n'est pas un secret de session.
      httpOnly: false,
    },
  };
}
