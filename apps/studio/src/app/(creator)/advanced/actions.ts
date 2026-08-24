'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  return authUser;
}

/**
 * 🤝 Envoyer une demande de collaboration/co-rédaction sur un article
 * Go-first : POST /v1/collaborations/invite-by-email.
 */
export async function sendCollaborationRequestAction(articleId: string, inviteeEmail: string) {
  try {
    const inviter = await getAuthenticatedUser();

    if (!inviteeEmail || !inviteeEmail.includes('@')) {
      return { success: false, error: 'Adresse email invalide' };
    }

    const resp = await goFetch<{ success: boolean; request: unknown }>(
      '/v1/collaborations/invite-by-email',
      { method: 'POST', body: { articleId, inviteeEmail } }
    );
    revalidatePath('/advanced');
    return { success: true, request: resp.request };
  } catch (err: unknown) {
    console.error('[Send Collaboration Request Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de l'envoi de l'invitation",
    };
  }
}

/**
 * 📩 Répondre à une demande de collaboration (Accepter / Refuser + Option Profil Public)
 * Go-first : POST /v1/collaborations/{requestId}/respond.
 */
export async function respondToCollaborationRequestAction(
  requestId: string,
  accept: boolean,
  showOnPublicProfile: boolean = true
) {
  try {
    const user = await getAuthenticatedUser();

    await goFetch(`/v1/collaborations/${encodeURIComponent(requestId)}/respond`, {
      method: 'POST',
      body: { accept, showOnPublicProfile },
    });
    revalidatePath('/advanced');
    return { success: true };
  } catch (err: unknown) {
    console.error('[Respond Collaboration Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de la réponse à l'invitation",
    };
  }
}

/**
 * ✉️ Invitation structurée depuis l'éditeur d'article.
 * Go-first : POST /v1/collaborations/invite.
 */
export async function sendArticleContributorInvitationAction(data: {
  articleId: string;
  inviteeId: string;
  role?: string;
  order?: number;
  showOnPublicProfile?: boolean;
}) {
  try {
    const inviter = await getAuthenticatedUser();

    const resp = await goFetch<{ success: boolean; request: unknown }>(
      '/v1/collaborations/invite',
      {
        method: 'POST',
        body: {
          articleId: data.articleId,
          inviteeId: data.inviteeId,
          role: data.role,
          order: data.order,
        },
      }
    );
    revalidatePath('/advanced');
    revalidatePath(`/articles/${data.articleId}`);
    return { success: true, request: resp.request };
  } catch (err: unknown) {
    console.error('[Send Article Contributor Invitation Error]', err);
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'invitation" };
  }
}

/** Retire une attribution publique à la demande du propriétaire de l'article.
 * Go-first : DELETE /v1/collaborations/{articleId}/contributors/{contributorId}. */
export async function removeArticleContributorAction(articleId: string, contributorId: string) {
  try {
    const actor = await getAuthenticatedUser();

    await goFetch(
      `/v1/collaborations/${encodeURIComponent(articleId)}/contributors/${encodeURIComponent(contributorId)}`,
      { method: 'DELETE' }
    );
    revalidatePath(`/articles/${articleId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[Remove Article Contributor Error]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

/** Permet au contributeur de retirer lui-même son consentement.
 * Go-first : POST /v1/collaborations/{articleId}/withdraw. */
export async function withdrawArticleContributorConsentAction(articleId: string) {
  try {
    const contributor = await getAuthenticatedUser();

    await goFetch(`/v1/collaborations/${encodeURIComponent(articleId)}/withdraw`, {
      method: 'POST',
    });
    return { success: true };
  } catch (err: unknown) {
    console.error('[Withdraw Article Contributor Consent Error]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

interface CollaborationRequestListItem {
  id: string;
  articleId: string;
  status: string;
  article?: { id: string; title: string; slug: string } | null;
  inviter?: { id: string; name: string | null; email: string; username: string | null } | null;
  invitee?: { id: string; name: string | null; email: string; username: string | null } | null;
}

/**
 * 📥 Récupérer les demandes de collaboration reçues et envoyées
 * Go-first : GET /v1/collaborations.
 */
export async function getCollaborationRequestsAction() {
  try {
    const user = await getAuthenticatedUser();

    const resp = await goFetch<{
      received: CollaborationRequestListItem[];
      sent: CollaborationRequestListItem[];
    }>('/v1/collaborations');
    return { success: true, received: resp.received || [], sent: resp.sent || [] };
  } catch (err: unknown) {
    console.error('[Get Collaboration Requests Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la récupération',
      received: [],
      sent: [],
    };
  }
}
