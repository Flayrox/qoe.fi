// =====================================================================
// 🏗️ admin-infra-data — stockage médias, campagnes staff, santé plateforme
// =====================================================================
// Trois surfaces d'exploitation qui n'avaient pas d'écran alors que l'API les
// portait (plan console, Phase 5/7). Mêmes règles que le reste de la couche de
// données : toute liste rendue est un TABLEAU (jamais `null`), un échec d'API
// rend une liste vide plutôt qu'une page blanche.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

// ── Stockage médias ───────────────────────────────────────────────────────

export interface StorageUserUsage {
  ownerId: string;
  totalBytes: number;
  assetCount: number;
}

export interface StorageUsage {
  totalBytes: number;
  assetCount: number;
  byStatus: Record<string, number>;
  topUsers: StorageUserUsage[];
}

/** Saturation du bucket images : totaux, statuts, plus gros consommateurs. */
export async function getStorageUsage(limit = 20): Promise<StorageUsage> {
  const empty: StorageUsage = { totalBytes: 0, assetCount: 0, byStatus: {}, topUsers: [] };
  try {
    const body = await goFetch<Partial<StorageUsage>>(`/v1/admin/storage/usage?limit=${limit}`);
    return {
      totalBytes: typeof body?.totalBytes === 'number' ? body.totalBytes : 0,
      assetCount: typeof body?.assetCount === 'number' ? body.assetCount : 0,
      byStatus: body?.byStatus && typeof body.byStatus === 'object' ? body.byStatus : {},
      topUsers: Array.isArray(body?.topUsers) ? body.topUsers : [],
    };
  } catch {
    return empty;
  }
}

import type { StaffCampaign } from './admin-campaign-types';
export * from './admin-campaign-types';

/** Campagnes staff (les plus récentes d'abord). */
export async function getStaffCampaigns(): Promise<StaffCampaign[]> {
  try {
    const body = await goFetch<{ items?: StaffCampaign[] | null }>('/v1/admin/campaigns');
    return Array.isArray(body?.items) ? body.items : [];
  } catch {
    return [];
  }
}

// ── Santé de la plateforme ───────────────────────────────────────────────

export interface PlatformHealth {
  postgres: { ok: boolean; latencyMs: number; error?: string } | null;
  migration: { applied: number; error?: string } | null;
  mode: 'observe' | 'enforce';
  version: string;
  decisions: {
    last24h: { allowed: number; deniedObserved: number; deniedEnforced: number };
    recorder: { written: number; dropped: number; queued: number };
  };
}

/** État de la plateforme : base, migration, mode d'autorisation, décisions. */
export async function getPlatformHealth(): Promise<PlatformHealth | null> {
  try {
    return await goFetch<PlatformHealth>('/v1/admin/health');
  } catch {
    return null;
  }
}
