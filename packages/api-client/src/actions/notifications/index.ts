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

import { notifications } from '@qoe/db';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';

export type NotificationFilter = 'all' | 'mentions' | 'replies' | 'likes' | 'collaborations';

export const getNotificationsAction = safeAction<
  { filter?: NotificationFilter; limit?: number; cursor?: string },
  { notifications: notifications.GroupedNotification[]; nextCursor: string | null }
>(async (rawInput) => {
  const filter = rawInput?.filter || 'all';
  const limit = rawInput?.limit || 30;
  const cursor = rawInput?.cursor;

  try {
    const res = await goFetch<{
      notifications?: notifications.GroupedNotification[];
      nextCursor?: string | null;
    }>(
      `/v1/notifications?filter=${filter}&limit=${limit}&cursor=${encodeURIComponent(cursor ?? '')}`
    );
    return {
      notifications: (res?.notifications ?? []).filter(Boolean),
      nextCursor: res?.nextCursor ?? null,
    };
  } catch {
    return {
      notifications: [],
      nextCursor: null,
    };
  }
});

export const getUnreadNotificationCountAction = safeAction<void, { count: number }>(async () => {
  try {
    return await goFetch<{ count: number }>('/v1/notifications/unread-count');
  } catch {
    return { count: 0 };
  }
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
  { preferences: Awaited<ReturnType<typeof notifications.getPreferences>> }
>(async () => {
  return goFetch<{ preferences: Awaited<ReturnType<typeof notifications.getPreferences>> }>(
    '/v1/notifications/preferences'
  );
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
>(async (input) => {
  return goFetch<{ preferences: Awaited<ReturnType<typeof notifications.updatePreferences>> }>(
    '/v1/notifications/preferences',
    { method: 'PATCH', body: input }
  );
});
