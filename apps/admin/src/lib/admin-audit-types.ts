// =====================================================================
// 🧾 admin-audit-types — types et utilitaires purs d'audit (Phase 4)
// =====================================================================
// Découplé des fetchers serveur (goFetch) pour être importable en toute
// sécurité dans les Client Components sans embarquer next/headers.
// =====================================================================

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
