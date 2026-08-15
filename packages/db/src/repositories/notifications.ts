// =====================================================================
// 🔔 Notifications Repository — Couche d'accès typée & agrégation
// =====================================================================

import { prisma } from '../client';
import { NotificationType, type Prisma } from '@prisma/client';
import { logger } from '@qoe/observability';

export interface GroupedNotification {
  id: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: Date;
  thoughtId?: string | null;
  articleId?: string | null;
  commentId?: string | null;
  thought?: {
    id: string;
    content: string;
    createdAt: Date;
  } | null;
  article?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  comment?: {
    id: string;
    content: string;
  } | null;
  publication?: {
    id: string;
    name: string | null;
    slug?: string | null;
  } | null;
  senders: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  }>;
  totalCount: number;
}

/**
 * ⚡ Crée une notification si le destinataire est différent de l'expéditeur et que les préférences le permettent.
 */
export async function createNotification(data: {
  recipientId: string;
  senderId: string;
  type: NotificationType;
  thoughtId?: string | null;
  articleId?: string | null;
  commentId?: string | null;
  publicationId?: string | null;
}): Promise<Prisma.NotificationGetPayload<Record<string, never>> | null> {
  // Ne pas notifier soi-même
  if (data.recipientId === data.senderId) {
    return null;
  }

  try {
    // Vérifier les préférences de notification du destinataire
    const prefs = await getPreferences(data.recipientId);

    // Filtrer selon le type
    if (data.type === 'LIKE' && !prefs.pushLikes && !prefs.emailLikes) return null;
    if (data.type === 'REPLY' && !prefs.pushReplies && !prefs.emailReplies) return null;
    if (data.type === 'COMMENT' && !prefs.pushComments && !prefs.emailComments) return null;
    if (data.type === 'MENTION' && !prefs.pushMentions && !prefs.emailMentions) return null;
    if (data.type === 'FOLLOW' && !prefs.pushFollows && !prefs.emailFollows) return null;
    if (data.type === 'REPOST' && !prefs.pushReposts && !prefs.emailReposts) return null;
    if (
      data.type === 'MEDIA_INVITE' ||
      data.type === 'MEDIA_MEMBER_JOINED' ||
      data.type === 'MEDIA_ARTICLE_PUBLISHED'
    ) {
      if (!prefs.pushMedia && !prefs.emailMedia) return null;
    }

    // Idempotence : éviter les doublons identiques non lus
    const existing = await prisma.notification.findFirst({
      where: {
        recipientId: data.recipientId,
        senderId: data.senderId,
        type: data.type,
        thoughtId: data.thoughtId || null,
        articleId: data.articleId || null,
        commentId: data.commentId || null,
        publicationId: data.publicationId || null,
        isRead: false,
      },
    });

    if (existing) {
      return existing;
    }

    return await prisma.notification.create({
      data: {
        recipientId: data.recipientId,
        senderId: data.senderId,
        type: data.type,
        thoughtId: data.thoughtId || null,
        articleId: data.articleId || null,
        commentId: data.commentId || null,
        publicationId: data.publicationId || null,
      },
    });
  } catch (error) {
    logger.error('Erreur création notification', { err: error });
    return null;
  }
}

/**
 * 📣 Notifie les abonnés d'une publication MEDIA qu'un article vient de sortir.
 * Fan-out borné (500) pour éviter les explosions de volume.
 */
export async function notifyMediaArticlePublished(
  publicationId: string,
  articleId: string,
  senderId: string
): Promise<void> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: { type: true },
  });
  if (publication?.type !== 'MEDIA') return;

  const followers = await prisma.follows.findMany({
    where: { publicationId },
    select: { readerId: true },
    take: 500,
  });

  await Promise.allSettled(
    followers.map((f) =>
      createNotification({
        recipientId: f.readerId,
        senderId,
        type: 'MEDIA_ARTICLE_PUBLISHED',
        articleId,
        publicationId,
      })
    )
  );
}

/**
 * 🗑️ Supprime une notification lors d'un Unlike ou Unfollow.
 */
export async function deleteNotification(data: {
  recipientId: string;
  senderId: string;
  type: NotificationType;
  thoughtId?: string | null;
  articleId?: string | null;
  publicationId?: string | null;
}): Promise<boolean> {
  try {
    await prisma.notification.deleteMany({
      where: {
        recipientId: data.recipientId,
        senderId: data.senderId,
        type: data.type,
        thoughtId: data.thoughtId || null,
        articleId: data.articleId || null,
        publicationId: data.publicationId || null,
      },
    });
    return true;
  } catch (error) {
    logger.error('Erreur suppression notification', { err: error });
    return false;
  }
}

/**
 * 📜 Récupère et regroupe intelligemment les notifications destinées à un utilisateur.
 */
export async function getNotifications(
  recipientId: string,
  filter: 'all' | 'mentions' | 'replies' | 'likes' = 'all',
  limit = 30,
  cursor?: string
): Promise<{ notifications: GroupedNotification[]; nextCursor: string | null }> {
  let typeFilter: NotificationType[] | undefined;

  if (filter === 'mentions') {
    typeFilter = ['MENTION'];
  } else if (filter === 'replies') {
    typeFilter = ['REPLY', 'COMMENT'];
  } else if (filter === 'likes') {
    typeFilter = ['LIKE'];
  }

  const rawNotifications = await prisma.notification.findMany({
    where: {
      recipientId,
      ...(typeFilter ? { type: { in: typeFilter } } : {}),
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      thought: {
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      },
      article: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
      comment: {
        select: {
          id: true,
          content: true,
        },
      },
      publication: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  let nextCursor: string | null = null;
  if (rawNotifications.length > limit) {
    const nextItem = rawNotifications.pop();
    nextCursor = nextItem?.id || null;
  }

  // 🧠 Algorithme d'agrégation intelligente (Bluesky Gold Standard)
  // Regroupe les notifications de même type et sur le même objet (Thought/Article) créées à moins de 48h d'intervalle.
  const grouped: GroupedNotification[] = [];
  const MS_48H = 48 * 60 * 60 * 1000;

  for (const item of rawNotifications) {
    const existingGroup = grouped.find(
      (g) =>
        g.type === item.type &&
        (g.thoughtId === item.thoughtId || g.articleId === item.articleId) &&
        Math.abs(g.createdAt.getTime() - item.createdAt.getTime()) < MS_48H
    );

    if (existingGroup) {
      if (!existingGroup.senders.some((s) => s.id === item.sender.id)) {
        existingGroup.senders.push(item.sender);
        existingGroup.totalCount += 1;
      }
      if (!item.isRead) {
        existingGroup.isRead = false;
      }
    } else {
      grouped.push({
        id: item.id,
        type: item.type,
        isRead: item.isRead,
        createdAt: item.createdAt,
        thoughtId: item.thoughtId,
        articleId: item.articleId,
        commentId: item.commentId,
        thought: item.thought,
        article: item.article,
        comment: item.comment,
        publication: item.publication,
        senders: [item.sender],
        totalCount: 1,
      });
    }
  }

  return { notifications: grouped, nextCursor };
}

/**
 * 📊 Compte les notifications non lues.
 */
export async function getUnreadCount(recipientId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      recipientId,
      isRead: false,
    },
  });
}

/**
 * 🟢 Marque les notifications comme lues.
 */
export async function markAsRead(
  recipientId: string,
  notificationIds?: string[]
): Promise<boolean> {
  try {
    if (notificationIds && notificationIds.length > 0) {
      await prisma.notification.updateMany({
        where: {
          recipientId,
          id: { in: notificationIds },
        },
        data: { isRead: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: { recipientId, isRead: false },
        data: { isRead: true },
      });
    }
    return true;
  } catch (error) {
    logger.error('Erreur marquage notifications lues', { err: error });
    return false;
  }
}

/**
 * ⚙️ Récupère les préférences de notifications d'un utilisateur.
 */
export async function getPreferences(userId: string) {
  let prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs) {
    prefs = await prisma.notificationPreference.create({
      data: { userId },
    });
  }

  return prefs;
}

/**
 * ⚙️ Met à jour les préférences de notifications d'un utilisateur.
 */
export async function updatePreferences(
  userId: string,
  data: Partial<{
    emailLikes: boolean;
    pushLikes: boolean;
    emailReplies: boolean;
    pushReplies: boolean;
    emailMentions: boolean;
    pushMentions: boolean;
    emailFollows: boolean;
    pushFollows: boolean;
    emailReposts: boolean;
    pushReposts: boolean;
    emailComments: boolean;
    pushComments: boolean;
    emailMedia: boolean;
    pushMedia: boolean;
  }>
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: { ...data },
  });
}
