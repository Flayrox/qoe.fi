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
import type { AdminApprovalItem } from './admin-approval-types';

export * from './admin-approval-types';

const ACCESS_DENIED_MESSAGE = 'Lecture refusée : la capacité admin.legal.read est requise.';

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
