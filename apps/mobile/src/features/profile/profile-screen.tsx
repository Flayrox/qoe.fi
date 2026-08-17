import {
  type ApiResponse,
  type FeedFetcherFn,
  type FeedSlice,
  feedKeys,
  useInfiniteFeed,
  userKeys,
} from '@qoe/api-client/mobile';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/thought/avatar';
import { ThoughtFeedSlice } from '@/components/thought/thought-feed-slice';
import { ProfileMenuButton } from '@/features/profile/profile-menu';
import { Spacing } from '@/constants/theme';
import { useMe } from '@/hooks/use-me';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';

// =====================================================================
// 👤 ProfileScreen — Profil public d'un utilisateur
// =====================================================================
// Charge le profil (GET /v1/users/{username}) et ses pensées publiques
// (GET /v1/users/{username}/posts). Header : image de couverture, avatar,
// nom + handle, bio (heroText), stats (followers/articles) et bouton
// « Suivre » (POST /v1/users/{publicationId}/follow). ⚠️ L'id du profil
// public est le **publicationId** — c'est lui qu'attend l'endpoint follow.
// =====================================================================

// Adapte le client au contrat du hook (FeedResult → ApiResponse<FeedSlice[]>).
const makeFetcher =
  (username: string): FeedFetcherFn<FeedSlice> =>
  async ({ cursor, limit }) => {
    const res = await apiClient.getUserPosts(username, { cursor: cursor ?? undefined, limit });
    if (!res.ok) throw new Error(res.error);
    const response: ApiResponse<FeedSlice[]> = {
      data: res.data.items,
      meta: { cursor: res.data.nextCursor, hasMore: res.data.hasMore },
    };
    return response;
  };

export function ProfileScreen({
  username,
  onNavigateBack,
}: {
  username: string;
  onNavigateBack?: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  // Profil public (publicationId dans data.id).
  const { data: profile, isPending: profilePending } = useQuery({
    queryKey: userKeys.profile(username),
    queryFn: async () => {
      const res = await apiClient.getUserProfile(username);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // Synchronise l'état initial depuis la réponse du profil (isFollowing).
  useEffect(() => {
    if (profile) setFollowing(profile.isFollowing);
  }, [profile]);

  // Pensées de l'utilisateur (infini).
  const {
    data,
    hasNextPage,
    isFetching,
    fetchNextPage,
    refetch,
    isPending: postsPending,
    isError,
    isRefetching,
  } = useInfiniteFeed<FeedSlice>({ limit: 20, username, fetcher: makeFetcher(username) });

  const items = useMemo(() => data?.pages.flatMap((page) => page?.data ?? []) ?? [], [data]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching && !isRefetching) void fetchNextPage();
  }, [hasNextPage, isFetching, isRefetching, fetchNextPage]);

  const toggleFollow = async () => {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await apiClient.toggleFollowUser(profile.id); // id = publicationId
      if (res.ok) {
        setFollowing(res.data.following);
        await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const isPending = profilePending && postsPending;

  if (isPending) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.center}>
        <ThemedText type="small">{t('profile.not_found', 'Profil introuvable')}</ThemedText>
        {onNavigateBack ? (
          <Pressable onPress={onNavigateBack}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              {t('common.back', 'Retour')}
            </ThemedText>
          </Pressable>
        ) : null}
      </SafeAreaView>
    );
  }

  const handle = profile.subdomain || profile.slug;
  const isFollowing = following ?? profile.isFollowing ?? false;
  const followersCount = profile._count?.followers ?? 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThoughtFeedSlice slice={item} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListHeaderComponent={
            <View>
              {/* Bannière de couverture */}
              {profile.headerImageUrl ? (
                <Image
                  source={{ uri: profile.headerImageUrl }}
                  style={[styles.cover, { backgroundColor: theme.backgroundSelected }]}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View
                  style={[
                    styles.cover,
                    styles.coverFallback,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                />
              )}

              {/* Avatar chevauchant la bannière */}
              <View style={styles.avatarRow}>
                <Avatar
                  user={{ name: profile.name, username: handle, logoUrl: profile.logoUrl }}
                  size="lg"
                  showCertified={profile.isCertified}
                />
                <View style={styles.followWrap}>
                  {me?.id !== profile.id ? (
                    <Pressable
                      onPress={() => void toggleFollow()}
                      disabled={followBusy}
                      style={({ pressed }) => [
                        styles.followButton,
                        {
                          backgroundColor: isFollowing
                            ? theme.backgroundSelected
                            : pressed
                              ? theme.backgroundSelected
                              : theme.primary,
                        },
                      ]}
                    >
                      {followBusy ? (
                        <ActivityIndicator size="small" color={theme.text} />
                      ) : (
                        <ThemedText
                          type="smallBold"
                          style={{ color: isFollowing ? theme.text : '#ffffff' }}
                        >
                          {isFollowing
                            ? t('profile.following', 'Suivi')
                            : t('profile.follow', 'Suivre')}
                        </ThemedText>
                      )}
                    </Pressable>
                  ) : null}
                  <ProfileMenuButton username={handle} isOwn={me?.id === profile.id} />
                </View>
              </View>

              {/* Identité */}
              <View style={styles.identity}>
                <ThemedText style={styles.name} numberOfLines={1}>
                  {profile.name || handle}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  @{handle}
                </ThemedText>
                {profile.heroText ? (
                  <ThemedText type="small" style={styles.bio}>
                    {profile.heroText}
                  </ThemedText>
                ) : null}

                {/* Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <ThemedText type="smallBold">{followersCount}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {' '}
                      {t('profile.followers', 'abonnés')}
                    </ThemedText>
                  </View>
                  <View style={styles.stat}>
                    <ThemedText type="smallBold">{profile._count?.articles ?? 0}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {' '}
                      {t('profile.articles', 'articles')}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Séparateur */}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>
          }
          ListEmptyComponent={
            isError ? (
              <ThemedView style={styles.empty}>
                <ThemedText type="small">
                  {t('profile.posts_error', 'Impossible de charger les pensées')}
                </ThemedText>
                <Pressable onPress={() => void refetch()}>
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    {t('common.retry', 'Réessayer')}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ) : (
              <ThemedView style={styles.empty}>
                <ThemedText type="small">
                  {t('profile.no_posts', 'Aucune pensée publiée pour le moment')}
                </ThemedText>
              </ThemedView>
            )
          }
          ListFooterComponent={
            hasNextPage ? <ActivityIndicator color={theme.text} style={styles.footer} /> : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    paddingBottom: Spacing.four,
    gap: Spacing.two,
    flexGrow: 1,
  },
  cover: {
    width: '100%',
    height: 140,
  },
  coverFallback: {
    height: 96,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    marginTop: -Spacing.five, // fait chevaucher l'avatar sur la bannière
  },
  followWrap: {
    marginBottom: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  followButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  identity: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  bio: {
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.three,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  footer: {
    paddingVertical: Spacing.three,
  },
  separator: {
    height: Spacing.two,
  },
});
