// =====================================================================
// 🎛️ Active Workspace — Contexte de travail actif (Personnel | Média)
// =====================================================================
// 📖 Le dashboard est piloté par le workspace actif (cookie posé par le
//    switcher). Chaque section (Home, Articles, Audience, Analytics,
//    Réglages...) opère sur cette publication : la publication personnelle
//    du créateur OU celle du Média sélectionné — sans changer de compte.
//
//    Résolution unique : `@qoe/sdk/actions/workspace` (Go
//    `GET /v1/workspaces/active`, membership active uniquement). `cache()`
//    déduplique l'appel quand le layout et la page le demandent dans la même
//    requête.
// =====================================================================

import { cache } from 'react';
import { getActiveWorkspaceContext } from '@qoe/sdk/actions/workspace';
import {
  parseWorkspaceCookie,
  serializeWorkspaceCookie,
  WORKSPACE_COOKIE,
  type WorkspaceRef,
} from '@qoe/sdk/workspace';

export { WORKSPACE_COOKIE, serializeWorkspaceCookie };
export type { WorkspaceRef };

export interface ActiveWorkspace {
  type: 'PERSONAL' | 'MEDIA';
  publisherId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** mediaId uniquement si type === 'MEDIA' */
  mediaId?: string;
  /** rôle du user dans le Média (si type === 'MEDIA') */
  mediaRole?: string;
  /** permissions effectives (base du rôle + overrides) */
  permissions: string[];
  /** cookie média devenu inaccessible → repli sur le profil personnel */
  fallbackFromMediaId?: string;
}

/** Compat : le parseur vit désormais dans `@qoe/sdk/workspace`. */
export const parseCookie = parseWorkspaceCookie;

/**
 * 🎛️ Résout le workspace actif de l'utilisateur — Go-only.
 * - Média actif si l'utilisateur en est membre **actif** → contexte MEDIA.
 * - Sinon → publication personnelle du créateur.
 *
 * Pas de fallback inventé : si Go est indisponible, l'erreur remonte (mieux
 * vaut une page d'erreur qu'une écriture silencieuse dans la mauvaise
 * publication avec `publisherId = userId`).
 */
export const getActiveWorkspace = cache(async (userId: string): Promise<ActiveWorkspace> => {
  // La clé de cache est le userId ; la résolution elle-même lit le cookie.
  void userId;
  return getActiveWorkspaceContext();
});

/**
 * 🎛️ Version "server action" : résout la publication active.
 * À utiliser dans les actions serveur du dashboard pour être workspace-aware.
 */
export async function getActivePublisherId(userId: string): Promise<string> {
  const ws = await getActiveWorkspace(userId);
  return ws.publisherId;
}
