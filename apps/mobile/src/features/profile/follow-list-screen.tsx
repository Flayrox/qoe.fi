// =====================================================================
// 👥 FollowListScreen — Abonnés / Abonnements d'un profil (mobile)
// =====================================================================
// Port des onglets Followers/Following de Bluesky (ProfileFollowers.tsx +
// ProfileFollowing.tsx réunis). Branché sur les vrais endpoints Go :
// GET /v1/users/{username}/followers et /following (août 2026), paginés,
// avec état follow du viewer (`viewerFollows`) pour le bouton Suivre.
// =====================================================================

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/thought/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { Spacing } from '@/constants/theme';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { userKeys, type FollowActor } from '@qoe/sdk/mobile';
import { CustomSubHeader } from '@/components/header/CustomSubHeader';

export type FollowTab = 'followers' | 'following';

export function FollowListScreen({ username, tab }: { username: string; tab: FollowTab }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [active, setActive] = useState<FollowTab>(tab);
  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    data,
    isPending,
    isError,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey: [...userKeys.all, 'follow', active, username],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const params = { cursor: pageParam ?? 0, limit: 30 };
      const res =
        active === 'followers'
          ? await apiClient.getUserFollowers(username, params)
          : await apiClient.getUserFollowing(username, params);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.nextCursor ? allPages.length * 30 : undefined,
  });

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching) void fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  const toggleFollow = async (actor: FollowActor) => {
    if (busyId || !actor.publicationId) return;
    setBusyId(actor.id);
    try {
      // Le follow cible la publication : `publicationId` est fourni par
      // l'API Go (POST /v1/users/{publicationId}/follow).
      const res = await apiClient.toggleFollowUser(actor.publicationId);
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: userKeys.all });
      }
    } finally {
      setBusyId(null);
    }
  };

  const tabsHeader = (
    <View style={[styles.tabs, { backgroundColor: theme.backgroundSelected }]}>
      {(
        [
          { key: 'followers' as const, label: t('profile.followers', 'Abonnés') },
          { key: 'following' as const, label: t('profile.following_tab', 'Abonnements') },
        ] as const
      ).map((t) => {
        const isActive = active === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => setActive(t.key)}
            style={[styles.tab, isActive && { backgroundColor: theme.primary }]}
          >
            <ThemedText
              type="smallBold"
              style={{ color: isActive ? '#ffffff' : theme.textSecondary }}
            >
              {t.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <CustomSubHeader centerComponent={tabsHeader} />

      <SafeAreaView edges={['bottom']} style={[styles.safe, { paddingTop: 105 }]}>
        {isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <ErrorMessage
              message={t('follow.error', 'Impossible de charger cette liste')}
              onPressTryAgain={() => void refetch()}
            />
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => (
              <FollowRow
                actor={item}
                isOwn={me?.id === item.id}
                busy={busyId === item.id}
                onFollow={() => void toggleFollow(item)}
              />
            )}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            ListEmptyComponent={
              <EmptyState
                icon={{ ios: 'person.2', android: 'people', web: 'people' }}
                message={
                  active === 'followers'
                    ? t('follow.no_followers', 'Aucun abonné pour le moment.')
                    : t('follow.no_following', 'Ne suit personne pour le moment.')
                }
              />
            }
            ListFooterComponent={
              hasNextPage ? <ActivityIndicator color={theme.text} style={styles.footer} /> : null
            }
            ItemSeparatorComponent={() => (
              <View style={[styles.sep, { backgroundColor: theme.border }]} />
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function FollowRow({
  actor,
  isOwn,
  busy,
  onFollow,
}: {
  actor: FollowActor;
  isOwn: boolean;
  busy: boolean;
  onFollow: () => void;
}) {
  const theme = useTheme();

  const openProfile = () => {
    if (!actor.username) return;
    void import('expo-router').then(({ router }) =>
      router.push({
        pathname: '/user/[username]',
        params: { username: actor.username as string },
      })
    );
  };

  return (
    <Pressable
      onPress={openProfile}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar
        user={{ name: actor.name, username: actor.username, logoUrl: actor.logoUrl }}
        sizeNumber={40}
        showCertified={actor.isCertified}
      />
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={{ fontWeight: '600' }}>
          {actor.name || actor.username || '?'}
        </ThemedText>
        {actor.username ? (
          <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
            @{actor.username}
          </ThemedText>
        ) : null}
      </View>
      {!isOwn ? (
        <Pressable
          onPress={onFollow}
          disabled={busy}
          style={({ pressed }) => [
            styles.followBtn,
            {
              backgroundColor: actor.viewerFollows
                ? theme.backgroundSelected
                : pressed
                  ? theme.backgroundSelected
                  : theme.primary,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <ThemedText
              type="smallBold"
              style={{ color: actor.viewerFollows ? theme.text : '#ffffff' }}
            >
              {actor.viewerFollows
                ? t('profile.following', 'Suivi')
                : t('profile.follow', 'Suivre')}
            </ThemedText>
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 999,
    gap: 3,
  },
  tab: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  followBtn: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minWidth: 84,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
