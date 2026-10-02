'use server';

// =====================================================================
// 🤝 admin-approval-actions — demander et décider une double validation
// =====================================================================
// Deux gestes, deux responsabilités :
//   - DEMANDER la validation d'un acte (ici : publier une version juridique) —
//     c'est celui qui commet l'acte qui la porte, avec un motif écrit ;
//   - DÉCIDER (approuver / refuser) — une SECONDE personne autorisée ; le
//     serveur refuse l'auto-validation, et cette action ne fait que relayer.
//
// Les refus du serveur portent un code (`needs_review`, `needs_step_up`…) que
// `authzTrailers` transporte jusqu'à l'écran : « il manque une seconde
// validation » n'est pas « il manque un droit », et l'interface ne doit pas les
// confondre.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';
import { authzTrailers } from '@/lib/action-result';
import type { AdminApprovalItem } from '@/lib/admin-approval-data';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function revalidateApprovals() {
  revalidatePath('/admin/approvals');
  // Publier un texte opposable change aussi l'écran juridique et le tableau de
  // conformité : la validation ne doit pas laisser derrière elle un écran qui
  // montre encore l'ancien état.
  revalidatePath('/admin/legal');
  revalidatePath('/admin/compliance');
}

/**
 * 🙋 Demande la validation d'une publication juridique. Le motif est
 * obligatoire (il part dans la file ET dans le journal d'audit) : une
 * validation à deux sans motif écrit ne se relit pas.
 */
export async function requestLegalPublishApprovalAction(versionId: string, reason: string) {
  // Défense en profondeur : demander la validation est une écriture juridique
  // (elle ouvre un dossier d'approbation), pas une lecture de courtoisie.
  await assertCapability('admin.legal.write');
  try {
    const approval = await goFetch<AdminApprovalItem>(
      `/v1/admin/legal/versions/${encodeURIComponent(versionId)}/request-publish`,
      { method: 'POST', body: { reason } }
    );
    revalidateApprovals();
    return { success: true as const, approval };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: errorMessage(error, 'Demande de validation impossible'),
      ...authzTrailers(error),
    };
  }
}

/** ✅ / ⛔ Approuve ou refuse une demande — une seconde personne, jamais l'auteur. */
export async function decideApprovalAction(input: {
  approvalId: string;
  decision: 'approved' | 'rejected';
  note?: string;
}) {
  // Décider engage la responsabilité de la personne qui valide : la capacité de
  // l'acte est vérifiée ici aussi, pas seulement dans le garde Go.
  await assertCapability('admin.legal.write');
  try {
    const approval = await goFetch<AdminApprovalItem>(
      `/v1/admin/approvals/${encodeURIComponent(input.approvalId)}/decide`,
      { method: 'POST', body: { decision: input.decision, note: input.note ?? '' } }
    );
    revalidateApprovals();
    return { success: true as const, approval };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: errorMessage(error, 'Décision impossible'),
      ...authzTrailers(error),
    };
  }
}
