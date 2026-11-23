// =====================================================================
// 🚪 admin-access-data — données des écrans d'accès staff
// =====================================================================
// Go en primaire : GET /v1/admin/access/* (capacité `admin.access.read`).
// Règle de la maison : toute liste rendue par ce module est un TABLEAU, jamais
// `null` — une slice vide sérialisée en `null` fait tomber l'interface
// (« This page couldn't load »). Un échec d'API n'est PAS une liste vide : il
// rend `ok: false` (voir `read-result`), et l'écran écrit noir sur blanc qu'il
// n'a pas pu lire — sinon une base vide et une panne Go se ressemblent.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { readOr, type Read } from './read-result';

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

/** Neutralise la forme `{ items }` : jamais null, et l'échec de lecture se voit. */
async function itemsOrEmpty<T>(path: string, what: string): Promise<Read<T[]>> {
  return readOr(what, async () => {
    const body = await goFetch<{ items?: T[] | null }>(path);
    return Array.isArray(body?.items) ? body.items : [];
  });
}

/** Attributions de rôles, filtrables par personne, rôle ou identifiant. */
export async function getAccessGrants(query = ''): Promise<Read<AccessGrantRow[]>> {
  const trimmed = query.trim();
  const suffix = trimmed ? `?q=${encodeURIComponent(trimmed)}` : '';
  return itemsOrEmpty<AccessGrantRow>(
    `/v1/admin/access/grants${suffix}`,
    'les attributions de rôles'
  );
}

/** Personnes candidates (motif d'au moins deux caractères côté serveur). */
export async function searchAccessPeople(query: string): Promise<Read<AccessPersonSummary[]>> {
  const trimmed = query.trim();
  // Moins de deux caractères : la recherche n'est pas lancée, la réponse
  // « aucun résultat » est vraie par construction.
  if (trimmed.length < 2) return { ok: true, data: [] };
  return itemsOrEmpty<AccessPersonSummary>(
    `/v1/admin/access/people?q=${encodeURIComponent(trimmed)}`,
    'la recherche de personnes'
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
export async function getAccessRoles(): Promise<Read<AccessRoleRow[]>> {
  return itemsOrEmpty<AccessRoleRow>('/v1/admin/access/roles', 'la matrice des rôles');
}

/** Vocabulaire des capacités (labels, domaines, descriptions). */
export async function getAccessCapabilities(): Promise<Read<AccessCapabilityRow[]>> {
  return itemsOrEmpty<AccessCapabilityRow>(
    '/v1/admin/access/capabilities',
    'le vocabulaire des capacités'
  );
}

/** Répartition des rôles dans la revue d'accès. */
export interface AccessRoleCount {
  roleKey: string;
  roleLabel: string;
  count: number;
}

/** Instantané d'une revue périodique des accès. */
export interface AccessReviewReport {
  period: string;
  generatedAt: string;
  totalStaff: number;
  activeGrants: number;
  expiredGrants: number;
  expiringSoon: number;
  rolesDistribution: AccessRoleCount[];
  expiringList: AccessGrantRow[];
  expiredList: AccessGrantRow[];
}

/** Ligne archivée d'une revue périodique des accès. */
export interface AccessReviewItem {
  id: string;
  period: string;
  report: AccessReviewReport;
  createdAt: string;
}

/** Données complètes des revues d'accès (direct + archives). */
export interface AccessReviewsData {
  current: AccessReviewReport | null;
  items: AccessReviewItem[];
  total: number;
}

/** Revues périodiques archivées + rapport en direct. */
export async function getAccessReviews(limit = 24): Promise<Read<AccessReviewsData>> {
  return readOr('les revues d’accès', async () => {
    const res = await goFetch<{
      current?: AccessReviewReport;
      items?: AccessReviewItem[];
      total?: number;
    }>(`/v1/admin/access/reviews?limit=${limit}`);
    return {
      current: res?.current ?? null,
      items: Array.isArray(res?.items) ? res.items : [],
      total: res?.total ?? 0,
    };
  });
}

/** Revue mensuelle pour une période précise ('AAAA-MM'). */
export async function getAccessReviewPeriod(period: string): Promise<AccessReviewItem | null> {
  try {
    return await goFetch<AccessReviewItem>(
      `/v1/admin/access/reviews/${encodeURIComponent(period)}`
    );
  } catch {
    return null;
  }
}
