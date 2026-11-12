'use server';

// =====================================================================
// admin-security-actions — recalcul à chaud du score Trust (Lot 5)
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { authzTrailers } from '@/lib/action-result';
import { assertCapability } from '@/lib/admin-identity';
import type { TrustRecomputeResult } from './admin-security-data';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Invalide le cache Trust Redis d'un utilisateur, réévalue son profil en
 * direct côté Go et journalise l'opération dans AdminAuditLog.
 */
export async function recomputeUserTrustAction(userId: string) {
  await assertCapability('admin.abuse.decide');
  const trimmed = userId.trim();
  if (!trimmed) {
    return {
      success: false as const,
      error: 'Identifiant utilisateur requis.',
    };
  }

  try {
    const data = await goFetch<TrustRecomputeResult>(
      `/v1/admin/security/trust/${encodeURIComponent(trimmed)}/recompute`,
      { method: 'POST' }
    );
    revalidatePath('/admin/security');
    return { success: true as const, data };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: errorMessage(error, 'Impossible de recalculer le score Trust'),
      ...authzTrailers(error),
    };
  }
}
