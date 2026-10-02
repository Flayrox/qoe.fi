// =====================================================================
// 🤝 admin-approval-data — la file des doubles validations (Phase 8)
// =====================================================================
// Un acte N3 (publier un texte opposable, par exemple) n'est exécuté que si
// une SECONDE personne autorisée l'a approuvé pour CETTE cible. Cet écran lit
// la file : ce qui attend une validation, et ce qui a été décidé (pour relire).
//
// Lecture côté serveur : la file nomme des cibles et des motifs internes, elle
// ne transite pas par un état client avant d'être autorisée — le garde Go exige
// la capacité `admin.legal.read` sur la route, et la page revérifie la même
// capacité avant de rendre quoi que ce soit.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

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

const ACCESS_DENIED_MESSAGE = 'Lecture refusée : la capacité admin.legal.read est requise.';

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

/** Demandes récentes : en attente d'abord (le serveur trie), puis les décidées. */
export async function getApprovals(limit = 100): Promise<AdminApprovalItem[]> {
  try {
    const body = await goFetch<{ items?: AdminApprovalItem[] | null }>(
      `/v1/admin/approvals?limit=${limit}`
    );
    return Array.isArray(body?.items) ? body.items : [];
  } catch (err) {
    if ((err as { status?: number })?.status === 403) throw new Error(ACCESS_DENIED_MESSAGE);
    throw err;
  }
}

/** Une demande est-elle encore ouverte ? (`expiresAt` fait foi, pas le statut seul) */
export function isApprovalOpen(item: AdminApprovalItem, now = Date.now()): boolean {
  if (item.status !== 'pending') return false;
  const expiry = Date.parse(item.expiresAt);
  return !Number.isNaN(expiry) && expiry > now;
}
