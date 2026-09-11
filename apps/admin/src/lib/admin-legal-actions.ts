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

async function verifySuperadmin() {
  try {
    await goFetch('/v1/admin/dashboard');
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 403) throw new Error('Forbidden');
    throw err;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function revalidateLegal() {
  revalidatePath('/admin/legal');
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
}

/** 📚 Charge l'historique complet d'un document (chargement à la demande). */
export async function loadLegalVersionsAction(documentId: string): Promise<LegalVersionRow[]> {
  await verifySuperadmin();
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
  await verifySuperadmin();
  try {
    const doc = await goFetch('/v1/admin/legal', { method: 'POST', body: input });
    revalidateLegal();
    return { success: true as const, document: doc };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de création') };
  }
}

/** ✏️ Met à jour les métadonnées éditoriales d'un document. */
export async function updateLegalDocumentAction(id: string, input: LegalDocumentInput) {
  await verifySuperadmin();
  try {
    const doc = await goFetch(`/v1/admin/legal/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, document: doc };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de mise à jour') };
  }
}

/** 🗑️ Supprime un document et tout son historique. */
export async function deleteLegalDocumentAction(id: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/legal/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de suppression') };
  }
}

/** ➕ Crée un brouillon de nouvelle version. */
export async function createLegalVersionAction(documentId: string, input: LegalVersionInput) {
  await verifySuperadmin();
  try {
    const version = await goFetch(`/v1/admin/legal/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de création de version') };
  }
}

/** ✏️ Modifie un brouillon (refusé sur une version publiée/archivée). */
export async function updateLegalVersionAction(
  versionId: string,
  input: Partial<LegalVersionInput>
) {
  await verifySuperadmin();
  try {
    const version = await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}`, {
      method: 'PATCH',
      body: input,
    });
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de sauvegarde') };
  }
}

/** 🚀 Publie un brouillon (l'ancienne version publiée est archivée). */
export async function publishLegalVersionAction(versionId: string) {
  await verifySuperadmin();
  try {
    const version = await goFetch(
      `/v1/admin/legal/versions/${encodeURIComponent(versionId)}/publish`,
      { method: 'POST' }
    );
    revalidateLegal();
    return { success: true as const, version };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de publication') };
  }
}

/** 📦 Archive une version publiée (retrait sans destruction). */
export async function archiveLegalVersionAction(versionId: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}/archive`, {
      method: 'POST',
    });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur d’archivage') };
  }
}

/** 🗑️ Supprime un brouillon (les versions publiées/archivées sont immuables). */
export async function deleteLegalDraftAction(versionId: string) {
  await verifySuperadmin();
  try {
    await goFetch(`/v1/admin/legal/versions/${encodeURIComponent(versionId)}`, {
      method: 'DELETE',
    });
    revalidateLegal();
    return { success: true as const };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur de suppression') };
  }
}

/** 🌱 Installe les documents manquants depuis le contenu embarqué (idempotent). */
export async function seedLegalDefaultsAction() {
  await verifySuperadmin();
  try {
    const result = await goFetch('/v1/admin/legal/seed', { method: 'POST' });
    revalidateLegal();
    return { success: true as const, result };
  } catch (error: unknown) {
    console.error(error);
    return { success: false as const, error: errorMessage(error, 'Erreur d’installation') };
  }
}
