// =====================================================================
// 🤝 admin-approval-types — types et constantes de double validation
// =====================================================================
// Découplé des fetchers serveur (goFetch) pour être importable en toute
// sécurité dans les Client Components sans embarquer next/headers.
// =====================================================================

/** Une demande de double validation, telle que la console la porte. */
export interface AdminApprovalItem {
  id: string;
  /** Acte du noyau visé (`legal_publish`, `staff_high_impact`…). */
  act: string;
  /** Cible de l'acte : ici l'identifiant de version juridique. */
  target: string;
  capability: string;
  requestedBy: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'consumed' | string;
  decidedBy?: string;
  note?: string;
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
}

/** Libellés lisibles des actes soumis à quorum (jamais un code brut à l'écran). */
export const APPROVAL_ACT_LABELS: Record<string, string> = {
  legal_publish: 'Publication juridique',
  staff_high_impact: 'Acte staff à fort impact',
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
  consumed: 'Exercée',
};

/** Une demande est-elle encore ouverte ? (`expiresAt` fait foi, pas le statut seul) */
export function isApprovalOpen(item: AdminApprovalItem, now = Date.now()): boolean {
  if (item.status !== 'pending') return false;
  const expiry = Date.parse(item.expiresAt);
  return !Number.isNaN(expiry) && expiry > now;
}
