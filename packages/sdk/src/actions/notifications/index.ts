'use server';

// =====================================================================
// 🔔 actions/notifications — Server Actions du centre de notifications
// =====================================================================
// Liste groupée paginée (par curseur), compteur non-lus, marquage lu,
// préférences par canal (email/push).
// ✅ AOÛT 2026 : 100 % délégué au backend Go (apps/api/internal/
//    modules/notifications) — plus de fallback Prisma. QOE_API_URL
//    est requis (backend-of-record).
// ⚠️ Fichier serveur : non exposé au mobile (API Go /v1/notifications).
// =====================================================================

import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

export type NotificationFilter = 'all' | 'mentions' | 'replies' | 'likes' | 'collaborations';

export type GroupedNotificationType =
  | 'LIKE'
  | 'REPLY'
  | 'REPOST'
  | 'FOLLOW'
  | 'MENTION'
  | 'COMMENT'
  | 'MEDIA_INVITE'
  | 'MEDIA_MEMBER_JOINED';

/** 🔔 Notification groupée (shape API Go /v1/notifications). */
export interface GroupedNotification {
  id: string;
  notificationIds: string[];
  type: GroupedNotificationType;
  isRead: boolean;
  createdAt: string;
  thoughtId?: string | null;
  articleId?: string | null;
  commentId?: string | null;
  thought?: { id: string; content: string; createdAt: string } | null;
  article?: { id: string; title: string; slug: string } | null;
  comment?: { id: string; content: string } | null;
  publication?: { id: string; name: string | null; slug?: string | null } | null;
  senders: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  }>;
  totalCount: number;
}

/** ⚙️ Préférences de notifications (shape NotificationPreference). */
export interface NotificationPreferences {
  id: string;
  userId: string;
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
  emailCollaborations: boolean;
  pushCollaborations: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationPreferencesInput = Partial<{
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
  emailCollaborations: boolean;
  pushCollaborations: boolean;
}>;

export const getNotificationsAction = safeAction<
  { filter?: NotificationFilter; limit?: number; cursor?: string },
  { notifications: GroupedNotification[]; nextCursor: string | null }
>(async (rawInput) => {
  const filter = rawInput?.filter || 'all';
  const limit = rawInput?.limit || 30;
  const cursor = rawInput?.cursor;

  const res = await goFetch<{
    notifications?: GroupedNotification[];
    nextCursor?: string | null;
  }>(
    `/v1/notifications?filter=${filter}&limit=${limit}&cursor=${encodeURIComponent(cursor ?? '')}`
  );
  return {
    notifications: (res?.notifications ?? []).filter(Boolean),
    nextCursor: res?.nextCursor ?? null,
  };
});

export const getUnreadNotificationCountAction = safeAction<void, { count: number }>(async () => {
  return await goFetch<{ count: number }>('/v1/notifications/unread-count');
});

export const markNotificationsAsReadAction = safeAction<
  { notificationIds?: string[] } | undefined,
  { success: boolean }
>(async (rawInput) => {
  return goFetch<{ success: boolean }>('/v1/notifications/read', {
    method: 'POST',
    body: { notificationIds: rawInput?.notificationIds ?? [] },
  });
});

export const getNotificationPreferencesAction = safeAction<
  void,
  { preferences: NotificationPreferences }
>(async () => {
  return goFetch<{ preferences: NotificationPreferences }>('/v1/notifications/preferences');
});

export const updateNotificationPreferencesAction = safeAction<
  NotificationPreferencesInput,
  { preferences: NotificationPreferences }
>(async (input) => {
  return goFetch<{ preferences: NotificationPreferences }>('/v1/notifications/preferences', {
    method: 'PATCH',
    body: input,
  });
});
