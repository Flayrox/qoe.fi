'use server';

// =====================================================================
// 🚪 admin-access-actions — mouvements d'accès (attribuer, révoquer)
// =====================================================================
// Deux règles, non négociables :
//   1. la server-action revérifie la capacité `admin.access.grant` (défense en
//      profondeur) — le garde HTTP du Go reste le seul juge, mais une action
//      exposée ne se repose pas sur le fait qu'un bouton était affiché ;
//   2. le MOTIF est obligatoire et transmis tel quel : c'est lui qui rend le
//      journal d'audit relisible. Le serveur le valide aussi.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';

export interface AccessActionResult {
  ok: boolean;
  error?: string;
}

/** Message lisible d'une erreur Go (le code de refus est déjà dans le corps). */
function readableError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Mouvement d’accès impossible';
}

/**
 * Attribue un rôle à une personne, avec échéance optionnelle.
 * `expiresAt` : date simple `AAAA-MM-JJ` (le serveur couvre la journée) ou vide
 * pour « sans fin ».
 */
export async function grantRoleAction(input: {
  userId: string;
  roleKey: string;
  expiresAt: string;
  reason: string;
}): Promise<AccessActionResult> {
  try {
    await assertCapability('admin.access.grant');
    await goFetch('/v1/admin/access/grants', {
      method: 'POST',
      body: {
        userId: input.userId.trim(),
        roleKey: input.roleKey.trim(),
        expiresAt: input.expiresAt.trim(),
        reason: input.reason.trim(),
      },
    });
    revalidatePath('/admin/access');
    revalidatePath(`/admin/access/people/${input.userId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readableError(err) };
  }
}

/** Révoque un rôle. Le motif est obligatoire : une révocation muette est indistinguable d'une erreur. */
export async function revokeRoleAction(input: {
  userId: string;
  roleKey: string;
  reason: string;
}): Promise<AccessActionResult> {
  try {
    await assertCapability('admin.access.grant');
    await goFetch(
      `/v1/admin/access/grants/${encodeURIComponent(input.userId)}/${encodeURIComponent(input.roleKey)}/revoke`,
      { method: 'POST', body: { reason: input.reason.trim() } }
    );
    revalidatePath('/admin/access');
    revalidatePath(`/admin/access/people/${input.userId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readableError(err) };
  }
}
