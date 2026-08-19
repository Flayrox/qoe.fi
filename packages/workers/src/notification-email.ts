// =====================================================================
// 📧 @qoe/email — Notification email outbox
// =====================================================================
// Traitement des livraisons d'emails de notification en file (`outbox`) :
// - renderNotificationEmail : template pur (facile à snapshot-tester).
// - processNotificationEmailDelivery : réclame atomiquement une ligne
//   (plusieurs workers possibles sans doublon), envoie via le provider
//   injecté, persiste le statut SENT/FAILED.
// - drainNotificationEmailOutbox : traite une tranche de l'outbox (appelé
//   périodiquement par le scheduler).
// ⚠️ Côté mobile : les notifications push / emails sont hors scope client ;
//    le mobile lit les notifications via l'API Go
//    (apps/api-go/internal/modules/notifications).
// =====================================================================

import { prisma } from '@qoe/db/client';
import type { EmailProvider, OutboundEmail } from './email-provider';

export interface NotificationEmailInput {
  type: string;
  recipientEmail: string;
  recipientName?: string | null;
  senderName?: string | null;
  articleTitle?: string | null;
  articleSlug?: string | null;
  articleId?: string | null;
  publicationName?: string | null;
  publicBaseUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function articleUrl(input: NotificationEmailInput): string {
  const baseUrl = (input.publicBaseUrl || 'https://qoe.fi').replace(/\/$/, '');
  return input.articleSlug
    ? `${baseUrl}/article/${encodeURIComponent(input.articleSlug)}`
    : `${baseUrl}/advanced`;
}

/** Pure template function: easy to snapshot-test and independent of any provider. */
export function renderNotificationEmail(input: NotificationEmailInput): OutboundEmail {
  const recipient = escapeHtml(input.recipientName || 'Bonjour');
  const sender = escapeHtml(input.senderName || 'Un membre de qoe.fi');
  const title = escapeHtml(input.articleTitle || 'un article');
  const link = articleUrl(input);
  const isInvitation = input.type === 'ARTICLE_CONTRIBUTOR_INVITED';

  const subject = isInvitation
    ? `${input.senderName || 'Un auteur'} vous invite à contribuer à un article`
    : `Mise à jour de votre collaboration sur qoe.fi`;
  const text = isInvitation
    ? `${input.recipientName || 'Bonjour'},\n\n${input.senderName || 'Un auteur'} vous invite à apparaître comme contributeur de « ${input.articleTitle || 'un article'} ». Consultez la demande et choisissez si vous acceptez d'être cité : ${link}`
    : `${input.recipientName || 'Bonjour'},\n\nVotre collaboration sur « ${input.articleTitle || 'un article'} » a été mise à jour. Consultez votre espace collaborations : ${link}`;
  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f7f7f5;color:#171717;font-family:Arial,sans-serif;line-height:1.6">
    <div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e5e5e5">
      <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">qoe.fi</p>
      <h1 style="font-size:24px;line-height:1.2;font-weight:600">${isInvitation ? 'Une invitation à décider' : 'Mise à jour de collaboration'}</h1>
      <p>${recipient},</p>
      <p><strong>${sender}</strong> ${isInvitation ? `vous invite à être cité sur « <strong>${title}</strong> ».` : `a mis à jour votre collaboration sur « <strong>${title}</strong> ».`}</p>
      <p>Vous gardez le contrôle de votre consentement et de votre visibilité publique.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#171717;color:#fff;text-decoration:none">${isInvitation ? 'Voir la demande' : 'Ouvrir mes collaborations'}</a></p>
      <p style="font-size:12px;color:#777">Cet email est transactionnel. Les préférences email restent modifiables dans vos réglages.</p>
    </div>
  </body>
</html>`;

  return { to: input.recipientEmail, subject, text, html };
}

/**
 * Delivers one queued EMAIL row through an injected adapter.
 * This is intentionally not scheduled by default: a future BullMQ worker can call it.
 */
export async function processNotificationEmailDelivery(
  deliveryId: string,
  provider: EmailProvider,
  publicBaseUrl = process.env.QOE_PUBLIC_URL || 'https://qoe.fi'
): Promise<void> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      notification: {
        include: {
          recipient: true,
          sender: true,
          article: true,
          publication: true,
        },
      },
    },
  });

  if (!delivery || delivery.channel !== 'EMAIL' || delivery.status === 'SENT') return;
  if (delivery.status === 'DISABLED') return;

  // Claim atomiquement la ligne : plusieurs instances du worker peuvent tourner
  // sans envoyer le même email deux fois.
  const claimed = await prisma.notificationDelivery.updateMany({
    where: {
      id: deliveryId,
      channel: 'EMAIL',
      status: { in: ['QUEUED', 'FAILED'] },
      availableAt: { lte: new Date() },
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, provider: provider.name },
  });
  if (claimed.count === 0) return;

  try {
    const notification = delivery.notification;
    const message = renderNotificationEmail({
      type: notification.type,
      recipientEmail: delivery.recipient,
      recipientName: notification.recipient.name,
      senderName: notification.sender.name,
      articleTitle: notification.article?.title,
      articleSlug: notification.article?.slug,
      articleId: notification.articleId,
      publicationName: notification.publication?.name,
      publicBaseUrl,
    });
    const result = await provider.send(message);

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SENT',
        providerId: result.providerId || null,
        sentAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message : 'Email delivery failed',
      },
    });
    throw error;
  }
}

/**
 * Traite une petite tranche de l'outbox. Le scheduler du runtime peut appeler
 * cette fonction toutes les quelques secondes sans créer de doublons.
 */
export async function drainNotificationEmailOutbox(
  provider: EmailProvider,
  limit = 25
): Promise<number> {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      channel: 'EMAIL',
      status: 'QUEUED',
      availableAt: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, 100)),
  });

  let processed = 0;
  for (const delivery of deliveries) {
    try {
      await processNotificationEmailDelivery(delivery.id, provider);
      processed += 1;
    } catch {
      // L'erreur est déjà persistée sur NotificationDelivery ; le scheduler
      // poursuit les autres lignes et pourra réessayer plus tard.
    }
  }
  return processed;
}
