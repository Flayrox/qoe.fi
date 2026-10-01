// =====================================================================
// 🪪 admin-identity — l'accès de la personne connectée, côté serveur
// =====================================================================
// La console ne teste plus « est-ce un superadmin ? » mais « cette personne
// détient-elle la capacité de cet écran ? ». `GET /v1/admin/me` est la source :
// rôles et capacités résolus par le serveur Go, échéances déjà appliquées.
//
// L'interface n'est PAS l'autorité : masquer un bouton n'autorise rien. Ce
// module sert à ne pas proposer l'inatteignable, et `assertCapability` rejoue la
// vérification dans les server-actions (défense en profondeur) — le garde HTTP
// du Go reste, lui, le seul juge.
// =====================================================================

import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { navItemForPath, normalizeCapabilities, type AdminCapability } from './admin-console';

export interface AdminIdentity {
  userId: string;
  roles: string[];
  capabilities: AdminCapability[];
}

/** Contrat brut de `GET /v1/admin/me` (listes toujours non nulles côté Go). */
interface AdminMeResponse {
  userId?: string;
  roles?: string[] | null;
  capabilities?: string[] | null;
}

/**
 * Résout l'accès de la personne connectée. Retourne `null` quand l'API ne peut
 * pas répondre (session absente, service indisponible) : l'appelant décide
 * alors de renvoyer vers la connexion, jamais de laisser passer.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  try {
    const me = await goFetch<AdminMeResponse>('/v1/admin/me');
    return {
      userId: typeof me?.userId === 'string' ? me.userId : '',
      roles: Array.isArray(me?.roles)
        ? me.roles.filter((role): role is string => typeof role === 'string' && role.length > 0)
        : [],
      capabilities: normalizeCapabilities(me?.capabilities),
    };
  } catch {
    return null;
  }
}

/** Dit si l'identité détient la capacité. */
export function hasCapability(
  identity: AdminIdentity | null,
  capability: AdminCapability
): boolean {
  return Boolean(identity?.capabilities.includes(capability));
}

/** Capacités qu'un chemin d'écran exige (entrée de navigation la plus précise). */
export function capabilitiesForPath(pathname: string): AdminCapability[] {
  const item = navItemForPath(pathname);
  if (!item) return [];
  return [item.capability, ...(item.alsoUses ?? [])];
}

/** Capacité principale d'un chemin (vide si le chemin n'est pas un écran connu). */
export function primaryCapabilityForPath(pathname: string): AdminCapability | null {
  return navItemForPath(pathname)?.capability ?? null;
}

/**
 * Garde d'écran : redirige vers l'écran de refus EXPLICITE (jamais une
 * redirection silencieuse) quand la capacité manque. À appeler en tête d'une
 * page serveur : l'API refuserait de toute façon, autant le dire.
 */
export function requireCapability(
  identity: AdminIdentity | null,
  capability: AdminCapability
): void {
  if (!hasCapability(identity, capability)) {
    const params = new URLSearchParams({ capability });
    redirect(`/admin/forbidden?${params.toString()}`);
  }
}

/**
 * Garde de server-action : jette un refus explicite. Une server-action est un
 * point d'entrée HTTP comme un autre — elle revérifie donc la capacité au lieu
 * de faire confiance au fait que le bouton n'était pas affiché.
 */
export async function assertCapability(capability: AdminCapability): Promise<void> {
  const identity = await getAdminIdentity();
  if (!identity) {
    throw new Error('Session sans accès à la console (identité illisible).');
  }
  if (!hasCapability(identity, capability)) {
    throw new Error(`Accès refusé : la capacité ${capability} est requise.`);
  }
}
