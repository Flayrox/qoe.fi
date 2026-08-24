'use server';

import { createClient } from '@qoe/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

// Aligné sur ValidWebhookEvents (apps/api/internal/modules/webhooks/service.go).
// `article.scheduled` existe côté Go mais n'est encore émis par aucun flux.
const WEBHOOK_EVENTS = [
  'article.published',
  'article.updated',
  'article.deleted',
  'subscriber.created',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user;
}

export interface WebhookWithDeliveries {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  lastDelivery?: {
    id: string;
    status: string;
    httpStatus: number | null;
    event: string;
    createdAt: Date;
  } | null;
  deliveries: {
    id: string;
    status: string;
    httpStatus: number | null;
    event: string;
    createdAt: Date;
  }[];
}

export interface WebhookDeliveryLog {
  id: string;
  status: string;
  httpStatus: number | null;
  event: string;
  responseBody?: string | null;
  attempts?: number;
  createdAt: string | Date;
}

/** 📜 Logs de livraison détaillés d'un webhook (GET /v1/webhooks/{id}/deliveries). */
export async function listWebhookDeliveriesAction(webhookId: string) {
  const user = await getAuthenticatedUser();
  const workspace = await getActiveWorkspace(user.id);

  try {
    const deliveries = await goFetch<WebhookDeliveryLog[]>(
      `/v1/webhooks/${webhookId}/deliveries?publicationId=${encodeURIComponent(
        workspace.publicationId
      )}&limit=50`
    );
    return { success: true as const, deliveries };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

export async function listWebhooksAction() {
  const user = await getAuthenticatedUser();
  const workspace = await getActiveWorkspace(user.id);

  const webhooks = await goFetch<WebhookWithDeliveries[]>(
    `/v1/webhooks?publicationId=${encodeURIComponent(workspace.publicationId)}`
  );
  return {
    success: true as const,
    webhooks,
    events: WEBHOOK_EVENTS,
    workspaceName: workspace.name,
  };
}

export async function createWebhookAction(input: {
  name: string;
  url: string;
  events: WebhookEvent[];
}) {
  const user = await getAuthenticatedUser();

  const name = input.name?.trim();
  const url = input.url?.trim();
  if (!name || !url) return { success: false as const, error: 'Nom et URL requis' };
  if (!/^https:\/\//i.test(url) && !/^http:\/\/localhost/i.test(url)) {
    return {
      success: false as const,
      error: "L'URL doit commencer par https:// (ou http://localhost en dev)",
    };
  }
  const events = input.events.filter((e) => WEBHOOK_EVENTS.includes(e));
  if (events.length === 0)
    return { success: false as const, error: 'Sélectionnez au moins un événement' };

  const workspace = await getActiveWorkspace(user.id);

  try {
    const res = await goFetch<{ webhook: WebhookWithDeliveries; secret: string }>('/v1/webhooks', {
      method: 'POST',
      body: { publicationId: workspace.publicationId, name, url, events },
    });
    revalidatePath('/developer/webhooks');
    return { success: true as const, webhook: res.webhook, secret: res.secret };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

export async function deleteWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const workspace = await getActiveWorkspace(user.id);

  try {
    await goFetch(
      `/v1/webhooks/${id}?publicationId=${encodeURIComponent(workspace.publicationId)}`,
      {
        method: 'DELETE',
      }
    );
    revalidatePath('/developer/webhooks');
    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

export async function toggleWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const workspace = await getActiveWorkspace(user.id);

  try {
    const res = await goFetch<{ success: boolean; active: boolean }>(
      `/v1/webhooks/${id}/toggle?publicationId=${encodeURIComponent(workspace.publicationId)}`,
      { method: 'POST' }
    );
    revalidatePath('/developer/webhooks');
    return { success: true as const, active: res.active };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}

/** 📡 Test ping — envoie un événement de test signé au endpoint (Go). */
export async function testWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const workspace = await getActiveWorkspace(user.id);

  try {
    const res = await goFetch<{ success: boolean; status: number; response: string }>(
      `/v1/webhooks/${id}/test?publicationId=${encodeURIComponent(workspace.publicationId)}`,
      { method: 'POST' }
    );
    revalidatePath('/developer/webhooks');
    if (res.success) {
      return { success: true as const, status: res.status, response: res.response };
    }
    return { success: false as const, error: res.response || 'Test échoué' };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
    };
  }
}
