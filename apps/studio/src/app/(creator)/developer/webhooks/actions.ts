'use server';

import crypto from 'crypto';
import { createClient } from '@qoe/supabase/server';
import { prisma, type Prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';

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

function toWebhookDto(webhook: {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  deliveries: Array<{
    id: string;
    status: string;
    httpStatus: number | null;
    event: string;
    createdAt: Date;
  }>;
}): WebhookWithDeliveries {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    createdAt: webhook.createdAt,
    deliveries: webhook.deliveries.slice(0, 5),
    lastDelivery: webhook.deliveries[0] ?? null,
  };
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

/** 📜 Logs de livraison détaillés d'un webhook (via GET /v1/webhooks/{id}/deliveries en Go). */
export async function listWebhookDeliveriesAction(webhookId: string) {
  const user = await getAuthenticatedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

  const workspace = await getActiveWorkspace(user.id);

  if (isGoEnabled()) {
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

  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.publicationId !== workspace.publicationId) {
    return { success: false as const, error: 'Webhook introuvable' };
  }

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      httpStatus: true,
      event: true,
      responseBody: true,
      attempts: true,
      createdAt: true,
    },
  });
  return { success: true as const, deliveries };
}

export async function listWebhooksAction() {
  const user = await getAuthenticatedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

  const workspace = await getActiveWorkspace(user.id);

  if (isGoEnabled()) {
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

  const webhooks = await prisma.webhook.findMany({
    where: { publicationId: workspace.publicationId },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, httpStatus: true, event: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    success: true as const,
    webhooks: webhooks.map(toWebhookDto),
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
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

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

  if (isGoEnabled()) {
    try {
      const res = await goFetch<{ webhook: WebhookWithDeliveries; secret: string }>(
        '/v1/webhooks',
        {
          method: 'POST',
          body: { publicationId: workspace.publicationId, name, url, events },
        }
      );
      revalidatePath('/developer/webhooks');
      return { success: true as const, webhook: res.webhook, secret: res.secret };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : 'Erreur serveur',
      };
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');

  const webhook = await prisma.webhook.create({
    data: {
      publicationId: workspace.publicationId,
      name,
      url,
      secret,
      events,
      active: true,
    },
  });

  revalidatePath('/developer/webhooks');
  return { success: true as const, webhook, secret };
}

export async function deleteWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

  const workspace = await getActiveWorkspace(user.id);

  if (isGoEnabled()) {
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

  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing || existing.publicationId !== workspace.publicationId) {
    return { success: false as const, error: 'Webhook introuvable' };
  }

  await prisma.webhook.delete({ where: { id } });
  revalidatePath('/developer/webhooks');
  return { success: true as const };
}

export async function toggleWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

  const workspace = await getActiveWorkspace(user.id);

  if (isGoEnabled()) {
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

  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing || existing.publicationId !== workspace.publicationId) {
    return { success: false as const, error: 'Webhook introuvable' };
  }

  await prisma.webhook.update({ where: { id }, data: { active: !existing.active } });
  revalidatePath('/developer/webhooks');
  return { success: true as const, active: !existing.active };
}

/** 📡 Test ping — envoie un événement de test signé au endpoint. */
export async function testWebhookAction(id: string) {
  const user = await getAuthenticatedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { success: false as const, error: 'Utilisateur introuvable' };

  const workspace = await getActiveWorkspace(user.id);

  if (isGoEnabled()) {
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

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook || webhook.publicationId !== workspace.publicationId) {
    return { success: false as const, error: 'Webhook introuvable' };
  }

  const body = JSON.stringify({
    event: 'webhook.test',
    data: { publicationId: workspace.publicationId, workspace: workspace.name },
    timestamp: new Date().toISOString(),
  });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Qoe-Signature': `sha256=${signature}`,
        'X-Qoe-Event': 'webhook.test',
        'User-Agent': 'qoe-fi-webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await res.text();

    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'webhook.test',
        payload: { test: true } as Prisma.InputJsonObject,
        status: res.ok ? 'SUCCESS' : 'FAILED',
        httpStatus: res.status,
        responseBody: responseBody.slice(0, 1000) || null,
        attempts: 1,
      },
    });

    revalidatePath('/developer/webhooks');
    return {
      success: true as const,
      status: res.status,
      response: responseBody.slice(0, 500),
    };
  } catch (err) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'webhook.test',
        payload: { test: true } as Prisma.InputJsonObject,
        status: 'FAILED',
        responseBody: (err instanceof Error ? err.message : 'Erreur réseau').slice(0, 1000),
        attempts: 1,
      },
    });
    return { success: false as const, error: err instanceof Error ? err.message : 'Erreur réseau' };
  }
}
