'use server';

// =====================================================================
// 🔔 actions/notifications — Server Actions du centre de notifications
// =====================================================================
// Liste groupée paginée (par curseur), compteur non-lus, marquage lu,
// préférences par canal (email/push).
// 🔗 Proxy Go : quand QOE_API_GO_URL est défini, tout est délégué au
//    backend Go (apps/api-go/internal/modules/notifications) — le contrat
//    GroupedNotification est partagé.
// ⚠️ Fichier serveur : non exposé au mobile (API Go /v1/notifications).
// =====================================================================

import { notifications } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';
import { goFetch, isGoEnabled } from '../utils/go-client';

export type NotificationFilter = 'all' | 'mentions' | 'replies' | 'likes' | 'collaborations';

export const getNotificationsAction = safeAction<
  { filter?: NotificationFilter; limit?: number; cursor?: string },
  { notifications: notifications.GroupedNotification[]; nextCursor: string | null }
>(async (rawInput, user) => {
  const filter = rawInput?.filter || 'all';
  const limit = rawInput?.limit || 30;
  const cursor = rawInput?.cursor;

  // 🔗 Proxy Go : liste groupée + pagination servies par le backend Go.
  if (isGoEnabled()) {
    const res = await goFetch<{
      notifications: notifications.GroupedNotification[];
      nextCursor: string | null;
    }>(
      `/v1/notifications?filter=${filter}&limit=${limit}&cursor=${encodeURIComponent(cursor ?? '')}`
    );
    return res;
  }

  const result = await notifications.getNotifications(user.id, filter, limit, cursor);
  return result;
});

export const getUnreadNotificationCountAction = safeAction<void, { count: number }>(
  async (_, user) => {
    if (isGoEnabled()) {
      return goFetch<{ count: number }>('/v1/notifications/unread-count');
    }
    const count = await notifications.getUnreadCount(user.id);
    return { count };
  }
);

export const markNotificationsAsReadAction = safeAction<
  { notificationIds?: string[] } | undefined,
  { success: boolean }
>(async (rawInput, user) => {
  if (isGoEnabled()) {
    const res = await goFetch<{ success: boolean }>('/v1/notifications/read', {
      method: 'POST',
      body: { notificationIds: rawInput?.notificationIds ?? [] },
    });
    return res;
  }
  const success = await notifications.markAsRead(user.id, rawInput?.notificationIds);
  revalidatePath('/notifications');
  return { success };
});

export const getNotificationPreferencesAction = safeAction<
  void,
  { preferences: Awaited<ReturnType<typeof notifications.getPreferences>> }
>(async (_, user) => {
  if (isGoEnabled()) {
    return goFetch<{ preferences: Awaited<ReturnType<typeof notifications.getPreferences>> }>(
      '/v1/notifications/preferences'
    );
  }
  const prefs = await notifications.getPreferences(user.id);
  return { preferences: prefs };
});

export const updateNotificationPreferencesAction = safeAction<
  Partial<{
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
  }>,
  { preferences: Awaited<ReturnType<typeof notifications.updatePreferences>> }
>(async (input, user) => {
  if (isGoEnabled()) {
    return goFetch<{ preferences: Awaited<ReturnType<typeof notifications.updatePreferences>> }>(
      '/v1/notifications/preferences',
      { method: 'PATCH', body: input }
    );
  }
  const prefs = await notifications.updatePreferences(user.id, input);
  revalidatePath('/settings/notifications');
  return { preferences: prefs };
});
