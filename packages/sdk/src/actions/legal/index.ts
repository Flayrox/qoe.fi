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

/**
 * 📝 Documents qui exigent une acceptation, version courante incluse.
 *
 * Utilisé par le formulaire d'inscription : on affiche les cases à cocher avec
 * la version exacte (versionId) affichée à l'instant du clic. Le serveur ne
 * transformera le choix en preuve que si cette version est toujours celle qui
 * est publiée au moment où le compte est créé.
 */
export async function fetchLegalDocumentsToAccept(
  locale: string,
  audience?: string
): Promise<PublicLegalDocument[]> {
  try {
    const docs = await fetchLegalDocuments(locale);
    return docs.filter(
      (doc) =>
        doc.requiresAcceptance &&
        doc.versionId &&
        (audience === undefined || doc.audience === audience)
    );
  } catch {
    // Le contenu légal est indisponible (déploiement, incident) : on ne bloque
    // jamais une inscription pour ça. Le portail reposera la question.
    return [];
  }
}

/**
 * 🖊️ La charge utile déposée dans `user_metadata.signupConsent`, son type et
 * son constructeur pur vivent dans `@qoe/utils/legal-consent` : un module
 * `'use server'` ne peut exporter que des fonctions asynchrones, et le
 * formulaire d'inscription est un composant client.
 */
export type { SignupConsentPayload, ConsentDocument } from '@qoe/utils/legal-consent';

/**
 * ✅ Accepte plusieurs documents en une requête (fin d'onboarding, portail).
 * Idempotent côté API : un document déjà accepté n'est pas réécrit.
 */
export async function acceptLegalConsentsAction(input: {
  slugs: string[];
  locale: string;
  source?: string;
  method?: string;
}): Promise<{ success: boolean; count: number; error?: string }> {
  const slugs = Array.from(new Set(input.slugs.filter(Boolean)));
  if (slugs.length === 0) return { success: true, count: 0 };
  try {
    const data = await goFetch<{ count: number }>('/v1/legal/accept-batch', {
      method: 'POST',
      body: {
        slugs,
        locale: input.locale,
        source: input.source ?? 'web',
        method: input.method ?? 'checkbox',
      },
    });
    return { success: true, count: data.count ?? slugs.length };
  } catch (error) {
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Consentement non enregistré',
    };
  }
}

/**
 * 🍪 Journalise un choix de traceurs côté serveur (append-only).
 *
 * Volontairement accessible sans compte : la preuve d'un choix doit exister
 * pour un visiteur anonyme, c'est-à-dire pour l'immense majorité des visites.
 */
export async function recordCookieConsentAction(input: {
  consentId: string;
  sessionId?: string;
  locale: string;
  policyVersion: string;
  categories: Record<string, boolean>;
  source?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const data = await goFetch<{ id: string }>('/v1/legal/cookie-consent', {
      method: 'POST',
      body: input,
    });
    return { success: true, id: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Choix non journalisé',
    };
  }
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
