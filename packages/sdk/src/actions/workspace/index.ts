'use server';

// =====================================================================
// 🎛️ actions/workspace — résolveur unique du workspace actif
// =====================================================================
// 📖 Une seule source de vérité pour « sur quelle publication j'écris ? ».
//    - cookie `qoe_active_workspace` → mediaId (MEDIA) ou rien (PERSONAL) ;
//    - Go `GET /v1/workspaces/active` valide la membership active et renvoie
//      la publication + le rôle + les permissions effectives ;
//    - PERSONAL passe ensuite par `/v1/me/publisher` (get-or-create), car
//      l'endpoint actif peut renvoyer l'userId quand la publication n'existe
//      pas encore.
//    - Aucun fallback inventé : si Go est indisponible, l'erreur remonte.
// =====================================================================

import { cookies } from 'next/headers';
import { goFetch } from '../utils/go-client';
import { parseWorkspaceCookie, WORKSPACE_COOKIE, type WorkspaceType } from '../../workspace';

export interface ActiveWorkspaceContext {
  type: WorkspaceType;
  publisherId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** mediaId uniquement si type === 'MEDIA'. */
  mediaId?: string;
  /** rôle du user dans le média (si type === 'MEDIA'). */
  mediaRole?: string;
  /** Permissions effectives (base du rôle + overrides). */
  permissions: string[];
  /**
   * Renseigné quand le cookie demandait un média qui n'est plus accessible :
   * le workspace a retombé sur le profil personnel. Le front peut prévenir
   * l'utilisateur au lieu de le laisser écrire au mauvais endroit.
   */
  fallbackFromMediaId?: string;
}

interface GoActiveWorkspace {
  type?: WorkspaceType;
  publisherId?: string;
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  mediaId?: string;
  mediaRole?: string;
  permissions?: string[];
}

/**
 * Résout le workspace actif pour la requête courante.
 * Un média inaccessible (invitation non acceptée, membership révoquée) est
 * volontairement traité comme PERSONAL par Go ; on conserve l'info pour l'UI.
 */
export async function getActiveWorkspaceContext(): Promise<ActiveWorkspaceContext> {
  const cookieStore = await cookies();
  const saved = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE)?.value);
  const requestedMediaId = saved?.type === 'MEDIA' ? saved.id : undefined;
  const qs = requestedMediaId ? `?mediaId=${encodeURIComponent(requestedMediaId)}` : '';

  const ws = await goFetch<GoActiveWorkspace>(`/v1/workspaces/active${qs}`);

  if (ws.type === 'MEDIA' && ws.publisherId) {
    return {
      type: 'MEDIA',
      publisherId: ws.publisherId,
      name: ws.name ?? 'Média',
      slug: ws.slug ?? 'media',
      logoUrl: ws.logoUrl ?? null,
      mediaId: ws.mediaId ?? requestedMediaId,
      mediaRole: ws.mediaRole,
      permissions: ws.permissions ?? [],
    };
  }

  // PERSONAL : le Go garantit qu'un publisherId renvoyé ici est une vraie
  // publication personnelle (il renvoie "" quand elle n'existe pas encore et
  // ne fabrique jamais publisherId = userId, cf. workspaces/service.go). Un
  // test d'intégration Go verrouille ce contrat : on ne devine pas la forme
  // d'un identifiant côté TypeScript (l'ancien test `usr_` ne correspondait à
  // aucun identifiant réel et laissait donc passer n'importe quoi).
  if (ws.publisherId) {
    return {
      type: 'PERSONAL',
      publisherId: ws.publisherId,
      name: ws.name ?? 'Profil Personnel',
      slug: ws.slug ?? 'personal',
      logoUrl: ws.logoUrl ?? null,
      permissions: ws.permissions ?? [],
      ...(requestedMediaId ? { fallbackFromMediaId: requestedMediaId } : {}),
    };
  }

  // PERSONAL : get-or-create de la publication personnelle uniquement si ws.publisherId est vide
  // (jamais l'userId comme publisherId — un identifiant d'utilisateur n'est pas une publication).
  const personal = await goFetch<{ publisherId: string }>('/v1/me/publisher');
  return {
    type: 'PERSONAL',
    publisherId: personal.publisherId,
    name: ws.name ?? 'Profil Personnel',
    slug: ws.slug ?? 'personal',
    logoUrl: ws.logoUrl ?? null,
    permissions: ws.permissions ?? [],
    ...(requestedMediaId ? { fallbackFromMediaId: requestedMediaId } : {}),
  };
}

/** Compat : la plupart des actions n'ont besoin que de la publication. */
export async function getActivePublisherId(): Promise<string> {
  return (await getActiveWorkspaceContext()).publisherId;
}
