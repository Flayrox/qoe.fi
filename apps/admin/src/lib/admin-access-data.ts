// =====================================================================
// 🚪 admin-access-data — données des écrans d'accès staff
// =====================================================================
// Go en primaire : GET /v1/admin/access/* (capacité `admin.access.read`).
// Règle de la maison : toute liste rendue par ce module est un TABLEAU, jamais
// `null` — une slice vide sérialisée en `null` fait tomber l'interface
// (« This page couldn't load »). Un échec d'API rend une liste vide, l'écran
// affiche alors l'état vide au lieu d'une page blanche.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/** Une attribution de rôle telle que l'API la rend. */
export interface AccessGrantRow {
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  roleKey: string;
  roleLabel: string;
  roleIsSystem: boolean;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string | null;
  /** `active` = la ligne accorde ; `expired` = lisible mais inerte. */
  state: 'active' | 'expired';
}

/** Une personne candidate à une attribution. */
export interface AccessPersonSummary {
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  roles: string[];
  legacySuperadmin: boolean;
}

/** La réponse à « pourquoi cette personne détient-elle ceci ? ». */
export interface AccessPersonDetail {
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  legacySuperadmin: boolean;
  roles: AccessGrantRow[];
  capabilities: string[];
  capabilitySources: Record<string, string[]>;
}

/** Une ligne de la matrice rôle × capacité. */
export interface AccessRoleRow {
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
  capabilities: string[];
  holders: number;
}

/** Une capacité du vocabulaire semé en base. */
export interface AccessCapabilityRow {
  key: string;
  label: string;
  domain: string;
  description: string;
}

/** Neutralise la forme `{ items }` : jamais null, jamais d'exception qui casse la page. */
async function itemsOrEmpty<T>(path: string): Promise<T[]> {
  try {
    const body = await goFetch<{ items?: T[] | null }>(path);
    return Array.isArray(body?.items) ? body.items : [];
  } catch {
    return [];
  }
}

/** Attributions de rôles, filtrables par personne, rôle ou identifiant. */
export async function getAccessGrants(query = ''): Promise<AccessGrantRow[]> {
  const trimmed = query.trim();
  const suffix = trimmed ? `?q=${encodeURIComponent(trimmed)}` : '';
  return itemsOrEmpty<AccessGrantRow>(`/v1/admin/access/grants${suffix}`);
}

/** Personnes candidates (motif d'au moins deux caractères côté serveur). */
export async function searchAccessPeople(query: string): Promise<AccessPersonSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return itemsOrEmpty<AccessPersonSummary>(
    `/v1/admin/access/people?q=${encodeURIComponent(trimmed)}`
  );
}

/** Fiche d'accès d'une personne (null si la personne n'existe pas). */
export async function getAccessPerson(userId: string): Promise<AccessPersonDetail | null> {
  try {
    return await goFetch<AccessPersonDetail>(
      `/v1/admin/access/people/${encodeURIComponent(userId)}`
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/** Matrice rôle × capacité, telle que la base la porte. */
export async function getAccessRoles(): Promise<AccessRoleRow[]> {
  return itemsOrEmpty<AccessRoleRow>('/v1/admin/access/roles');
}

/** Vocabulaire des capacités (labels, domaines, descriptions). */
export async function getAccessCapabilities(): Promise<AccessCapabilityRow[]> {
  return itemsOrEmpty<AccessCapabilityRow>('/v1/admin/access/capabilities');
}
