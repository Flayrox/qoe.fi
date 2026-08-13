'use server';

import { notifications } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';

export const getNotificationsAction = safeAction<
  { filter?: 'all' | 'mentions' | 'replies' | 'likes'; limit?: number; cursor?: string },
  { notifications: notifications.GroupedNotification[]; nextCursor: string | null }
>(async (rawInput, user) => {
  const filter = rawInput?.filter || 'all';
  const limit = rawInput?.limit || 30;
  const cursor = rawInput?.cursor;

  const result = await notifications.getNotifications(user.id, filter, limit, cursor);
  return result;
});

export const getUnreadNotificationCountAction = safeAction<void, { count: number }>(
  async (_, user) => {
    const count = await notifications.getUnreadCount(user.id);
    return { count };
  }
);

export const markNotificationsAsReadAction = safeAction<
  { notificationIds?: string[] } | undefined,
  { success: boolean }
>(async (rawInput, user) => {
  const success = await notifications.markAsRead(user.id, rawInput?.notificationIds);
  revalidatePath('/notifications');
  return { success };
});

export const getNotificationPreferencesAction = safeAction<
  void,
  { preferences: Awaited<ReturnType<typeof notifications.getPreferences>> }
>(async (_, user) => {
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
  }>,
  { preferences: Awaited<ReturnType<typeof notifications.updatePreferences>> }
>(async (input, user) => {
  const prefs = await notifications.updatePreferences(user.id, input);
  revalidatePath('/settings/notifications');
  return { preferences: prefs };
});
