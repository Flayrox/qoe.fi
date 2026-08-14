'use client';

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from '../query-keys';
import type { NotificationFilter } from '../actions/notifications';
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markNotificationsAsReadAction,
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from '../actions/notifications';

export function useNotificationsQuery(filter: NotificationFilter = 'all') {
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: async () => {
      const res = await getNotificationsAction({ filter });
      if (res.ok) {
        return res.data.notifications;
      }
      return [];
    },
    staleTime: 1000 * 30, // 30s
  });
}

export function useNotificationsInfiniteQuery(filter: NotificationFilter = 'all', limit = 30) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await getNotificationsAction({ filter, limit, cursor: pageParam });
      if (res.ok) {
        return res.data;
      }
      return { notifications: [], nextCursor: null };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });
}

export function useUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      const res = await getUnreadNotificationCountAction();
      if (res.ok) {
        return res.data.count;
      }
      return 0;
    },
    refetchInterval: 1000 * 30, // Poll every 30s as fallback if Realtime disconnects
    staleTime: 1000 * 10,
  });
}

export function useMarkNotificationsAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds?: string[]) => {
      const res = await markNotificationsAsReadAction({ notificationIds });
      if (res.ok) {
        return res.data;
      }
      return { success: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: async () => {
      const res = await getNotificationPreferencesAction();
      if (res.ok) {
        return res.data.preferences;
      }
      return null;
    },
  });
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof updateNotificationPreferencesAction>[0]) => {
      const res = await updateNotificationPreferencesAction(input);
      if (res.ok) {
        return res.data.preferences;
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}
