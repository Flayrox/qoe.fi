// =====================================================================
// 🔗 Webhook Dispatch — Envoi d'événements signés HMAC vers les endpoints
// =====================================================================
// 📖 Pour chaque webhook actif de la publication concernée, crée une
//    WebhookDelivery puis POST le payload signé (HMAC-SHA256).
// =====================================================================

import crypto from 'crypto';
import { prisma, type Prisma } from '@qoe/db/client';
import { logger } from '@qoe/observability';

const WEBHOOK_EVENTS = {
  articlePublished: 'article.published',
  subscriberCreated: 'subscriber.created',
} as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

interface WebhookPayload {
  eventId: string;
  publicationId: string;
  [key: string]: unknown;
}

/**
 * 📤 Dispatche un événement de domaine vers tous les webhooks abonnés de la publication.
 */
export async function dispatchWebhooks(event: WebhookEventName, payload: WebhookPayload) {
  let webhooks;
  try {
    webhooks = await prisma.webhook.findMany({
      where: { publicationId: payload.publicationId, active: true, events: { has: event } },
    });
  } catch (err) {
    logger.error('Webhook lookup error', { err });
    return;
  }

  if (webhooks.length === 0) return;

  await Promise.allSettled(webhooks.map((webhook) => dispatchToWebhook(webhook, event, payload)));
}

async function dispatchToWebhook(
  webhook: { id: string; url: string; secret: string },
  event: string,
  payload: WebhookPayload
) {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload: payload as Prisma.InputJsonObject,
      status: 'PENDING',
    },
  });

  const body = JSON.stringify({
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Qoe-Signature': `sha256=${signature}`,
        'X-Qoe-Event': event,
        'User-Agent': 'qoe-fi-webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await res.text();

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? 'SUCCESS' : 'FAILED',
        httpStatus: res.status,
        responseBody: responseBody.slice(0, 2000) || null,
        attempts: { increment: 1 },
      },
    });
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        responseBody: (err instanceof Error ? err.message : 'Erreur réseau').slice(0, 2000) || null,
        attempts: { increment: 1 },
      },
    });
  }
}

export { WEBHOOK_EVENTS };
