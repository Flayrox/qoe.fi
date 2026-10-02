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

// ── Campagnes staff ──────────────────────────────────────────────────────

export interface StaffCampaign {
  id: string;
  type: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  subjectEn?: string;
  bodyHtmlEn?: string;
  bodyTextEn?: string;
  audienceType: string;
  audiencePublicationId?: string;
  audienceSnapshot?: string;
  status: string;
  draftedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  scheduledAt?: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffCampaignInput {
  type: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  subjectEn?: string;
  bodyHtmlEn?: string;
  bodyTextEn?: string;
  audienceType: string;
  audiencePublicationId?: string;
  scheduledAt?: string;
}

/** Catégories fermées de campagne (vocabulaire du serveur). */
export const CAMPAIGN_TYPES = [
  { value: 'LEGAL_NOTICE', label: 'Notification légale' },
  { value: 'STAFF_DIRECT', label: 'Message de l’équipe' },
  { value: 'PRODUCT_NEWS', label: 'Nouveauté produit' },
] as const;

/** Audiences fermées (publication = média nommé, sinon tout le monde). */
export const CAMPAIGN_AUDIENCES = [
  { value: 'ALL_USERS', label: 'Tous les comptes' },
  { value: 'PUBLICATION_SUBSCRIBERS', label: 'Abonnés d’une publication' },
] as const;

/** Transitions de cycle de vie, dans l'ordre du serveur. */
export const CAMPAIGN_TRANSITIONS = [
  { action: 'submit', label: 'Soumettre', from: 'DRAFT' },
  { action: 'approve', label: 'Approuver', from: 'SUBMITTED' },
  { action: 'start', label: 'Lancer', from: 'APPROVED' },
  { action: 'pause', label: 'Suspendre', from: 'SENDING' },
  { action: 'cancel', label: 'Annuler', from: 'DRAFT,SUBMITTED,APPROVED,SENDING,PAUSED' },
] as const;

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
