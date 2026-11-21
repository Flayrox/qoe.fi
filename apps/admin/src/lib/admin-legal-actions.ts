'use server';

// =====================================================================
// ⚖️ admin-legal-actions — édition du contenu juridique (console admin)
// =====================================================================
// Go en primaire : /v1/admin/legal/* (module Go `legal`, réservé
// superadmin — 403 sinon). Le contenu publié n'est jamais modifié en
// place : on publie une nouvelle version, l'ancienne est archivée (preuve).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { authzTrailers } from '@/lib/action-result';
import { assertCapability } from '@/lib/admin-identity';

type LegalGuardFailure = { success: false; error: string; code?: string; level?: string };

/**
 * Garde des actes juridiques. Un refus (capacité manquante, step-up exigé) est
 * une VALEUR, jamais un rejet : l'écran doit pouvoir lire \`code\` et proposer la
 * vérification de facteur. Les enveloppes du garde (\`code\`, \`level\`) sont
 * transportées telles quelles, comme dans \`admin-aux-actions\`.
 */
async function legalGuard(): Promise<LegalGuardFailure | null> {
  try {
    await goFetch('/v1/admin/dashboard');
    return null;
  } catch (err) {
    if ((err as { status?: number })?.status !== 403) throw err;
    return {
      success: false,
      error: errorMessage(err, 'Accès refusé à la console juridique'),
      ...authzTrailers(err),
    };
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function revalidateLegal() {
  revalidatePath('/admin/legal');
}

function revalidateCompliance() {
  revalidatePath('/admin/compliance');
}

export interface LegalDocumentInput {
  slug: string;
  category: string;
  audience: string;
  requiresAcceptance: boolean;
  isActive?: boolean;
  sortOrder?: number;
  // Première version (obligatoire à la création)
  locale?: string;
  version?: string;
  title?: string;
  summary?: string;
  body?: string;
  changelog?: string;
  publish?: boolean;
}

export interface LegalVersionRow {
  id: string;
  documentId: string;
  locale: string;
  version: string;
  title: string;
  summary: string;
  body?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changelog?: string;
  effectiveAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Fenêtre de publication automatique d'un brouillon (RFC3339). */
  scheduledAt?: string;
}

/** 📚 Charge l'historique complet d'un document (chargement à la demande). */
export async function loadLegalVersionsAction(documentId: string): Promise<LegalVersionRow[]> {
  // Lecture à la demande depuis un composant client : on revérifie la
  // capacité de lecture juridique ici aussi, pas seulement côté page.
  await assertCapability('admin.legal.read');
  const data = await goFetch<{ items: LegalVersionRow[] }>(
    `/v1/admin/legal/${encodeURIComponent(documentId)}/versions`
  );
  return data.items;
}

export interface LegalVersionInput {
  locale: string;
  version: string;
  title: string;
  summary?: string;
  body: string;
  changelog?: string;
  effectiveAt?: string;
}

/** ➕ Crée un document (et sa première version). */
export async function createLegalDocumentAction(input: LegalDocumentInput) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const doc = await goFetch('/v1/admin/legal', { method: 'POST', body: input });
    revalidateLegal();
    return { success: true as const, document: doc };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de création'),
      ...authzTrailers(error),
    };
  }
}

/** ✏️ Met à jour les métadonnées éditoriales d'un document. */
export async function updateLegalDocumentAction(id: string, input: LegalDocumentInput) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const doc = await goFetch(`/v1/admin/legal/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, document: doc };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de mise à jour'),
      ...authzTrailers(error),
    };
  }
}

/** 🗑️ Supprime un document et tout son historique. */
export async function deleteLegalDocumentAction(id: string) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    await goFetch(`/v1/admin/legal/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
  }
}

/** ➕ Crée un brouillon de nouvelle version. */
export async function createLegalVersionAction(documentId: string, input: LegalVersionInput) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const version = await goFetch(`/v1/admin/legal/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de création de version'),
      ...authzTrailers(error),
    };
  }
}

/** ✏️ Modifie un brouillon (refusé sur une version publiée/archivée). */
export async function updateLegalVersionAction(
  versionId: string,
  input: Partial<LegalVersionInput>
) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const version = await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}`, {
      method: 'PATCH',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de sauvegarde'),
      ...authzTrailers(error),
    };
  }
}

/** 🚀 Publie un brouillon (l'ancienne version publiée est archivée). */
export async function publishLegalVersionAction(versionId: string) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const version = await goFetch(
      `/v1/admin/legal/versions/${encodeURIComponent(versionId)}/publish`,
      { method: 'POST' }
    );
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de publication'),
      ...authzTrailers(error),
    };
  }
}

/** 📦 Archive une version publiée (retrait sans destruction). */
export async function archiveLegalVersionAction(versionId: string) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}/archive`, {
      method: 'POST',
    });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur d’archivage'),
      ...authzTrailers(error),
    };
  }
}

/** 🗑️ Supprime un brouillon (les versions publiées/archivées sont immuables). */
export async function deleteLegalDraftAction(versionId: string) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}`, {
      method: 'DELETE',
    });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de suppression'),
      ...authzTrailers(error),
    };
  }
}

/** ⏱️ Programme (ou annule) la publication automatique d'un brouillon. */
export async function scheduleLegalVersionAction(versionId: string, scheduledAt: string) {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const version = await goFetch(
      `/v1/admin/legal/versions/${encodeURIComponent(versionId)}/schedule`,
      { method: 'POST', body: { scheduledAt } }
    );
    revalidateLegal();
    revalidateCompliance();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur de planification'),
      ...authzTrailers(error),
    };
  }
}

/** 🔄 Déclenche un passage du cycle de vie sans attendre le worker. */
export async function runLegalLifecycleAction() {
  // Action de formulaire (`<form action>`), dont React n'attend rien : le refus
  // s'arrête ici, avec son message, au lieu de lancer un appel non autorisé.
  const guardFailure = await legalGuard();
  if (guardFailure) throw new Error(guardFailure.error);
  await goFetch('/v1/admin/legal/lifecycle/run', { method: 'POST' });
  revalidateCompliance();
  revalidateLegal();
}

/** ⏹️ Clôt une revue sans publication — un motif est exigé, c'est une décision. */
export async function dismissLegalReviewAction(formData: FormData) {
  const guardFailure = await legalGuard();
  if (guardFailure) throw new Error(guardFailure.error);
  const reviewId = String(formData.get('reviewId') ?? '');
  const notes = String(formData.get('notes') ?? '');
  if (!reviewId) throw new Error('Revue inconnue');
  await goFetch(`/v1/admin/legal/reviews/${encodeURIComponent(reviewId)}/dismiss`, {
    method: 'POST',
    body: { notes },
  });
  revalidateCompliance();
}

/** 🌱 Installe les documents manquants depuis le contenu embarqué (idempotent). */
export async function seedLegalDefaultsAction() {
  const guardFailure = await legalGuard();
  if (guardFailure) return guardFailure;
  try {
    const result = await goFetch('/v1/admin/legal/seed', { method: 'POST' });
    revalidateLegal();
    return { success: true as const, result };
  } catch (error: unknown) {
    console.error(error);
    return {
      success: false as const,
      error: errorMessage(error, 'Erreur d’installation'),
      ...authzTrailers(error),
    };
  }
}
