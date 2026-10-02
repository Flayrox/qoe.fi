// =====================================================================
// 🧾 admin-audit-data — audit lisible et journal des refus (Phase 4)
// =====================================================================
// Deux lectures :
//   - `getAuditLog` : le journal d'audit filtrable, plus le MODE d'autorisation
//     en vigueur (un audit lu pendant l'observation doit le dire) ;
//   - `getAuthzDecisions` : les décisions du garde, groupées par capacité, pour
//     préparer le passage en `authz-enforce`.
//
// Le CSV n'est pas fabriqué ici : il sort du serveur Go (`?format=csv`), avec la
// même autorisation et les mêmes filtres. Un export navigateur perdrait des
// colonnes et pourrait exporter autre chose que ce qui est affiché.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/** Une entrée du journal d'audit (colonnes 00057 incluses). */
export interface AdminAuditEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  capability: string | null;
  proofLevel: string | null;
  requestId: string | null;
  ip: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

/** Une décision du garde d'autorisation. */
export interface AuthzDecisionEntry {
  id: string;
  userId: string | null;
  email: string;
  capability: string;
  allowed: boolean;
  code: string;
  mode: 'observe' | 'enforce' | string;
  proofLevel: string | null;
  method: string;
  path: string;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
}

/** Agrégat par capacité : ce qu'il faut lire avant d'armer le refus. */
export interface AuthzDecisionGroup {
  capability: string;
  allowed: boolean;
  mode: string;
  code: string;
  total: number;
  lastAt: string;
}

export type AuthzMode = 'observe' | 'enforce';

export interface AuditFilters {
  actor?: string;
  capability?: string;
  action?: string;
  target?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuditLogView {
  items: AdminAuditEntry[];
  mode: AuthzMode;
}

const ACCESS_DENIED_MESSAGE = 'Lecture refusée : la capacité admin.audit.read est requise.';

/** Construit la query string d'un filtre d'audit (aucune valeur vide envoyée). */
export function auditQuery(filters: AuditFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === '') continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Journal d'audit filtré + mode d'autorisation en vigueur. */
export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditLogView> {
  try {
    const body = await goFetch<{ items?: AdminAuditEntry[] | null; mode?: string }>(
      `/v1/admin/audit-log${auditQuery(filters)}`
    );
    return {
      items: Array.isArray(body?.items) ? body.items : [],
      mode: body?.mode === 'enforce' ? 'enforce' : 'observe',
    };
  } catch (err) {
    if ((err as { status?: number })?.status === 403) throw new Error(ACCESS_DENIED_MESSAGE);
    return { items: [], mode: 'observe' };
  }
}

export interface DecisionFilters {
  capability?: string;
  denied?: boolean;
  userId?: string;
  window?: number;
  limit?: number;
}

export interface DecisionsView {
  items: AuthzDecisionEntry[];
  groups: AuthzDecisionGroup[];
  mode: AuthzMode;
}

/** Décisions du garde : accords, refus appliqués et refus observés. */
export async function getAuthzDecisions(filters: DecisionFilters = {}): Promise<DecisionsView> {
  const extra: Record<string, string> = {};
  if (filters.denied) extra.denied = '1';
  if (filters.capability) extra.capability = filters.capability;
  if (filters.userId) extra.userId = filters.userId;
  if (filters.window) extra.window = String(filters.window);
  if (filters.limit) extra.limit = String(filters.limit);
  try {
    const body = await goFetch<{
      items?: AuthzDecisionEntry[] | null;
      groups?: AuthzDecisionGroup[] | null;
      mode?: string;
    }>(`/v1/admin/access/decisions${auditQuery({}, extra)}`);
    return {
      items: Array.isArray(body?.items) ? body.items : [],
      groups: Array.isArray(body?.groups) ? body.groups : [],
      mode: body?.mode === 'enforce' ? 'enforce' : 'observe',
    };
  } catch (err) {
    if ((err as { status?: number })?.status === 403) throw new Error(ACCESS_DENIED_MESSAGE);
    return { items: [], groups: [], mode: 'observe' };
  }
}

/** Décisions de refus groupées par capacité, du plus fréquent au moins fréquent. */
export function denialGroups(groups: AuthzDecisionGroup[]): AuthzDecisionGroup[] {
  return groups.filter((group) => !group.allowed).sort((a, b) => b.total - a.total);
}

/** Le résumé chiffré d'une capacité : refus observés vs refus appliqués. */
export function modeSplit(groups: AuthzDecisionGroup[]): { observed: number; enforced: number } {
  let observed = 0;
  let enforced = 0;
  for (const group of groups) {
    if (group.allowed) continue;
    if (group.mode === 'enforce') enforced += group.total;
    else observed += group.total;
  }
  return { observed, enforced };
}
