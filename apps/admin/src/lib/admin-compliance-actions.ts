'use server';

// =====================================================================
// 🛡️ admin-compliance-actions — actions de conformité RGPD & DSAR
// =====================================================================
// Exécute les effacements de données personnelles (Art. 17 RGPD) et les
// exports DSAR (Art. 15 / 20) via l'API Go avec contrôle de capacité
// `admin.compliance.export` et authentification par step-up N2.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { authzTrailers } from '@/lib/action-result';
import { assertCapability } from '@/lib/admin-identity';
import type { DeletionRequestItem, ErasureReceipt, RetentionPurgeSummary } from '@/lib/admin-data';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 🗑️ Exécute l'effacement définitif des données personnelles d'un utilisateur (Art. 17 RGPD). */
export async function eraseUserAction(
  userId: string,
  reason: string,
  requestId?: string
): Promise<
  | { success: true; receipt: ErasureReceipt }
  | { success: false; error: string; challengeToken?: string; challengeFactor?: string }
> {
  await assertCapability('admin.compliance.export');

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return {
      success: false,
      error: 'Un motif légal ou opérationnel d’effacement est obligatoire.',
    };
  }

  try {
    const receipt = await goFetch<ErasureReceipt>(`/v1/admin/users/${userId}/erase`, {
      method: 'POST',
      body: {
        reason: trimmedReason,
        requestId: requestId || undefined,
      },
    });

    revalidatePath('/admin/compliance');
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${userId}`);

    return {
      success: true,
      receipt,
    };
  } catch (error: unknown) {
    console.error('eraseUserAction error:', error);
    return {
      success: false,
      error: errorMessage(error, 'Effacement impossible'),
      ...authzTrailers(error),
    };
  }
}

/** 📦 Exporte l'archive complète des données personnelles d'un utilisateur (DSAR). */
export async function exportUserDsarAction(
  userId: string,
  reason?: string
): Promise<
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string; challengeToken?: string; challengeFactor?: string }
> {
  await assertCapability('admin.compliance.export');

  try {
    const data = await goFetch<Record<string, unknown>>(`/v1/admin/users/${userId}/dsar-export`, {
      method: 'POST',
      body: { reason: reason?.trim() || undefined },
    });

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    console.error('exportUserDsarAction error:', error);
    return {
      success: false,
      error: errorMessage(error, 'Export DSAR impossible'),
      ...authzTrailers(error),
    };
  }
}

/** 📋 Récupère la liste à jour des demandes d'effacement en attente et traitées. */
export async function listDeletionRequestsAction(): Promise<DeletionRequestItem[]> {
  await assertCapability('admin.compliance.read');
  try {
    const data = await goFetch<{ items: DeletionRequestItem[] }>(
      '/v1/admin/compliance/deletion-requests'
    );
    return data.items ?? [];
  } catch {
    return [];
  }
}

/** 🧹 Exécute ou simule la purge de rétention par table ou globale. */
export async function runRetentionPurgeAction(
  table?: string,
  dryRun?: boolean
): Promise<
  | { success: true; summary: RetentionPurgeSummary }
  | { success: false; error: string; challengeToken?: string; challengeFactor?: string }
> {
  await assertCapability('admin.compliance.export');

  try {
    const summary = await goFetch<RetentionPurgeSummary>('/v1/admin/compliance/retention/purge', {
      method: 'POST',
      body: {
        table: table?.trim() || undefined,
        dryRun: Boolean(dryRun),
      },
    });

    revalidatePath('/admin/retention');
    revalidatePath('/admin/compliance');

    return {
      success: true,
      summary,
    };
  } catch (error: unknown) {
    console.error('runRetentionPurgeAction error:', error);
    return {
      success: false,
      error: errorMessage(error, 'Purge de rétention impossible'),
      ...authzTrailers(error),
    };
  }
}

export interface SignedExportVerification {
  isValid: boolean;
  scope?: string;
  algorithm?: string;
  keyId?: string;
  generatedAt?: string;
  error?: string;
}

/** 🔍 Contrôle universel d'un document d'export signé Ed25519 (audit, abonnés, consentements). */
export async function verifySignedExportAction(
  rawJson: string
): Promise<
  | { success: true; result: SignedExportVerification }
  | { success: false; error: string }
> {
  await assertCapability('admin.compliance.read');

  try {
    const parsed = JSON.parse(rawJson);
    const result = await goFetch<SignedExportVerification>(
      '/v1/admin/compliance/exports/verify',
      {
        method: 'POST',
        body: parsed,
      }
    );
    return { success: true, result };
  } catch (error: unknown) {
    return {
      success: false,
      error: errorMessage(error, 'Vérification cryptographique impossible'),
    };
  }
}
