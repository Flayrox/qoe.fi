'use server';

// =====================================================================
// ⚖️ actions/legal — contenu juridique & consentements (partagé)
// =====================================================================
//   - GET  /v1/legal                     → sommaire publié (locale)
//   - GET  /v1/legal/{slug}              → contenu markdown publié
//   - GET  /v1/legal/{slug}/versions     → historique public (transparence)
//   - GET  /v1/me/legal-pending          → consentements manquants (auth)
//   - POST /v1/legal/{slug}/accept       → preuve de consentement (auth)
//
// Une seule implémentation pour toutes les apps : le contenu est immuable
// côté API, et les consentements pointent vers une version exacte.
// =====================================================================

import { goFetch } from '../utils/go-client';

export interface PublicLegalDocument {
  id: string;
  slug: string;
  category: string;
  audience: string;
  requiresAcceptance: boolean;
  version: string;
  versionId: string;
  locale: string;
  title: string;
  summary: string;
  body?: string;
  changelog?: string;
  effectiveAt?: string;
  publishedAt?: string;
  updatedAt?: string;
}

export interface PublicLegalVersion {
  id: string;
  documentId: string;
  locale: string;
  version: string;
  title: string;
  summary: string;
  status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT';
  changelog?: string;
  effectiveAt?: string;
  publishedAt?: string;
  archivedAt?: string;
}

export interface PendingAcceptance {
  id: string;
  slug: string;
  category: string;
  audience: string;
  versionId: string;
  version: string;
  title: string;
  effectiveAt?: string;
}

/** 📚 Sommaire public des documents juridiques publiés. */
export async function fetchLegalDocuments(locale: string): Promise<PublicLegalDocument[]> {
  const data = await goFetch<{ items: PublicLegalDocument[] }>(
    `/v1/legal?locale=${encodeURIComponent(locale)}`
  );
  return data.items ?? [];
}

/** 📄 Contenu complet d'un document publié (markdown). null si inconnu. */
export async function fetchLegalDocument(
  slug: string,
  locale: string
): Promise<PublicLegalDocument | null> {
  try {
    return await goFetch<PublicLegalDocument>(
      `/v1/legal/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/** 🕰️ Historique public d'un document (versions publiées + archivées). */
export async function fetchLegalVersions(
  slug: string,
  locale: string
): Promise<PublicLegalVersion[]> {
  try {
    const data = await goFetch<{ items: PublicLegalVersion[] }>(
      `/v1/legal/${encodeURIComponent(slug)}/versions?locale=${encodeURIComponent(locale)}`
    );
    return data.items ?? [];
  } catch {
    // L'historique est un bonus de transparence : jamais bloquant.
    return [];
  }
}

/** ✅ Consentements manquants pour l'utilisateur connecté (vide si anonyme). */
export async function fetchPendingAcceptances(locale: string): Promise<PendingAcceptance[]> {
  try {
    const data = await goFetch<{ items: PendingAcceptance[] }>(
      `/v1/me/legal-pending?locale=${encodeURIComponent(locale)}`
    );
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * ✍️ Enregistre une preuve de consentement (idempotent côté API).
 * Appelable depuis un composant client : c'est une server action.
 */
export async function recordLegalConsentAction(input: {
  slug: string;
  locale: string;
  source?: string;
  method?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await goFetch(`/v1/legal/${encodeURIComponent(input.slug)}/accept`, {
      method: 'POST',
      body: {
        locale: input.locale,
        source: input.source ?? 'web',
        method: input.method ?? 'banner',
      },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Consentement non enregistré',
    };
  }
}
