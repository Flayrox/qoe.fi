'use server';

import { createClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

/**
 * Échec d'action : conserve le code du garde d'autorisation Go
 * (`needs_step_up` sur l'envoi d'une campagne, par ex.) pour que le client
 * puisse proposer le parcours utile au lieu d'un message muet.
 */
function failure(err: unknown, fallback: string): { success: false; error: string; code?: string } {
  const code = (err as { code?: string } | null)?.code;
  return {
    success: false as const,
    error: err instanceof Error ? err.message : fallback,
    ...(code ? { code } : {}),
  };
}

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  const workspace = await getActiveWorkspace(user.id);
  return { user, publicationId: workspace.publicationId, workspaceName: workspace.name };
}

export interface NewsletterIssue {
  id: string;
  publicationId: string;
  subject: string;
  previewText: string | null;
  html: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export async function listNewslettersAction() {
  const { publicationId } = await getContext();
  try {
    const res = await goFetch<{ items: NewsletterIssue[] }>(
      `/v1/newsletters?publicationId=${encodeURIComponent(publicationId)}`
    );
    return { success: true as const, items: res.items ?? [] };
  } catch (err) {
    return failure(err, 'Erreur serveur');
  }
}

export async function createNewsletterAction(input: {
  subject: string;
  previewText: string;
  html: string;
}) {
  const { publicationId } = await getContext();
  const subject = input.subject?.trim();
  const html = input.html?.trim();
  if (!subject || !html) return { success: false as const, error: 'Sujet et contenu requis' };

  try {
    await goFetch<NewsletterIssue>('/v1/newsletters', {
      method: 'POST',
      body: { publicationId, subject, previewText: input.previewText?.trim() ?? '', html },
    });
    revalidatePath('/newsletters');
    return { success: true as const };
  } catch (err) {
    return failure(err, 'Erreur serveur');
  }
}

export async function updateNewsletterAction(
  id: string,
  input: { subject: string; previewText: string; html: string }
) {
  const { publicationId } = await getContext();
  const subject = input.subject?.trim();
  const html = input.html?.trim();
  if (!subject || !html) return { success: false as const, error: 'Sujet et contenu requis' };

  try {
    await goFetch<NewsletterIssue>(`/v1/newsletters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { publicationId, subject, previewText: input.previewText?.trim() ?? '', html },
    });
    revalidatePath('/newsletters');
    return { success: true as const };
  } catch (err) {
    return failure(err, 'Erreur serveur');
  }
}

export async function deleteNewsletterAction(id: string) {
  await getContext();
  try {
    await goFetch(`/v1/newsletters/${encodeURIComponent(id)}`, { method: 'DELETE' });
    revalidatePath('/newsletters');
    return { success: true as const };
  } catch (err) {
    return failure(err, 'Erreur serveur');
  }
}

export async function sendNewsletterAction(id: string) {
  await getContext();
  try {
    await goFetch(`/v1/newsletters/${encodeURIComponent(id)}/send`, { method: 'POST' });
    revalidatePath('/newsletters');
    return { success: true as const };
  } catch (err) {
    return failure(err, 'Erreur serveur');
  }
}
