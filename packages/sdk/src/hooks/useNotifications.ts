'use client';

// =====================================================================
// 🔔 useNotifications — Hooks React Query pour le centre de notifications
// =====================================================================
// Wraps les actions serveur de notifications (web). Expose :
// - useNotificationsQuery / useNotificationsInfiniteQuery : liste (pagination
//   par curseur, stale 30s).
// - useUnreadNotificationCountQuery : compteur non-lus (poll 30s en secours
//   si le Realtime Supabase est déconnecté).
// - useMarkNotificationsAsReadMutation : marquage lu (invalide la famille).
// - useNotificationPreferencesQuery / useUpdateNotificationPreferencesMutation :
//   préférences par canal.
// ⚠️ Côté mobile, les notifications viendront de l'API Go
//    (apps/api/internal/modules/notifications).
// =====================================================================

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from '../query-keys';
import type { NotificationFilter } from '../actions/utils/notification-filter';
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markNotificationsAsReadAction,
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from '../actions/notifications';
import { unwrapActionResult } from '../lib/actionResult';

export function useNotificationsQuery(filter: NotificationFilter = 'all') {
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: async () =>
      unwrapActionResult(await getNotificationsAction({ filter }), 'Notifications indisponibles')
        .notifications,
    staleTime: 1000 * 30, // 30s
  });
}

export function useNotificationsInfiniteQuery(filter: NotificationFilter = 'all', limit = 30) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      return unwrapActionResult(
        await getNotificationsAction({ filter, limit, cursor: pageParam }),
        'Notifications indisponibles'
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });
}

export function useUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () =>
      unwrapActionResult(await getUnreadNotificationCountAction(), 'Compteur indisponible').count,
    refetchInterval: 1000 * 30, // Poll every 30s as fallback if Realtime disconnects
    staleTime: 1000 * 10,
  });
}

export function useMarkNotificationsAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds?: string[]) =>
      unwrapActionResult(
        await markNotificationsAsReadAction({ notificationIds }),
        'Marquage impossible'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: async () =>
      unwrapActionResult(await getNotificationPreferencesAction(), 'Préférences indisponibles')
        .preferences,
  });
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof updateNotificationPreferencesAction>[0]) =>
      unwrapActionResult(
        await updateNotificationPreferencesAction(input),
        'Enregistrement impossible'
      ).preferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}
