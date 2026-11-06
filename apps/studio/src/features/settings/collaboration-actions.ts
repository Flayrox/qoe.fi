'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  return authUser;
}

interface CollaborationRequestListItem {
  id: string;
  articleId: string;
  status: string;
  article?: { id: string; title: string; slug: string } | null;
  inviter?: { id: string; name: string | null; username: string | null } | null;
  invitee?: { id: string; name: string | null; username: string | null } | null;
}

/**
 * Demandes de collaboration reçues et envoyées.
 * Go-first : GET /v1/collaborations.
 */
export async function getCollaborationRequestsAction() {
  try {
    await getAuthenticatedUser();

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

/**
 * Accepter ou refuser une demande de collaboration.
 * Go-first : POST /v1/collaborations/{requestId}/respond.
 */
export async function respondToCollaborationRequestAction(
  requestId: string,
  accept: boolean,
  showOnPublicProfile: boolean = true
) {
  try {
    await getAuthenticatedUser();

    await goFetch(`/v1/collaborations/${encodeURIComponent(requestId)}/respond`, {
      method: 'POST',
      body: { accept, showOnPublicProfile },
    });
    revalidatePath('/settings');
    return { success: true };
  } catch (err: unknown) {
    console.error('[Respond Collaboration Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de la réponse à l'invitation",
    };
  }
}
