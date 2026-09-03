import {
  type ApiResponse,
  type FeedFetcherFn,
  type FeedSlice,
  feedKeys,
  useInfiniteFeed,
  userKeys,
} from '@qoe/sdk/mobile';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Appearance,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
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

import { CustomSubHeader } from '@/components/header/CustomSubHeader';
import { LiquidElasticButton } from '@/components/liquid-tab-bar/LiquidElasticButton';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';

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
  username: initialUsername,
  onNavigateBack,
}: {
  username: string;
  onNavigateBack?: () => void;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || Appearance.getColorScheme() === 'dark';
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [msgBusy, setMsgBusy] = useState(false);
  const scrollY = useSharedValue(0);

  const onScrollHandler = (event: any) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  };

  // Si username vaut 'me', on résout avec le username/publicationId du compte connecté
  const resolvedUsername =
    initialUsername === 'me' ? me?.username || me?.publicationId || 'admin' : initialUsername;

  // Profil public (publicationId dans data.id).
  const { data: profile, isPending: profilePending } = useQuery({
    queryKey: userKeys.profile(resolvedUsername),
    queryFn: async () => {
      const res = await apiClient.getUserProfile(resolvedUsername);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!resolvedUsername,
  });

  // Synchronise l'état initial depuis la réponse du profil (isFollowing).
  useEffect(() => {
    if (profile) setFollowing(profile.isFollowing);
  }, [profile]);

  // Pensées publiques du profil (infini).
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    refetch,
    isRefetching,
    isError,
  } = useInfiniteFeed<FeedSlice>({
    username: resolvedUsername,
    limit: 20,
    minVisibleQuota: 20,
    fetcher: useMemo(() => makeFetcher(resolvedUsername), [resolvedUsername]),
    enabled: !!resolvedUsername,
  });

  const items = useMemo(
    () => postsData?.pages.flatMap((page) => page?.data ?? []) ?? [],
    [postsData]
  );

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

  const startConversation = async () => {
    if (!profile?.ownerUserId || msgBusy) return;
    setMsgBusy(true);
    try {
      const res = await apiClient.createConversation(profile.ownerUserId);
      if (res.ok) {
        router.push({
          pathname: '/conversation/[id]',
          params: { id: res.data.id },
        });
      }
    } finally {
      setMsgBusy(false);
    }
  };

  const isPending = profilePending;

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
          <Pressable onPress={onNavigateBack} hitSlop={8} style={{ padding: 8 }}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              {t('common.back', 'Retour')}
            </ThemedText>
          </Pressable>
        ) : null}
      </SafeAreaView>
    );
  }

  const handle = profile.subdomain || profile.slug;
  const isOwn =
    (!!me?.id && (me.id === profile.id || me.id === profile.ownerUserId)) ||
    (!!me?.publicationId && me.publicationId === profile.id) ||
    (!!me?.username &&
      (me.username.toLowerCase() === handle.toLowerCase() ||
        me.username.toLowerCase() === (profile.slug || '').toLowerCase()));
  const isFollowing = following ?? profile.isFollowing ?? false;
  const followersCount = profile._count?.followers ?? 0;

  return (
    <ThemedView style={styles.container}>
      {/* ─── Header Custom Flottant Liquid Glass & Morphing ─── */}
      <CustomSubHeader
        title={profile.name || handle}
        subtitle={`@${handle}`}
        scrollY={scrollY}
        showTitleOnScrollOnly={true}
        scrollThreshold={100}
        onBackPress={onNavigateBack}
        rightComponent={
          <ProfileMenuButton
            username={handle}
            isOwn={me?.id === profile.id}
            customButton={({ onPress }) => (
              <LiquidElasticButton
                size={42}
                borderRadius={21}
                onPress={onPress}
                accessibilityLabel={t('profile.more', 'Plus d’options')}
                icon={<Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />}
              />
            )}
          />
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThoughtFeedSlice slice={item} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          onScroll={onScrollHandler}
          scrollEventThrottle={16}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListHeaderComponent={
            <View style={styles.headerWrapper}>
              {/* ─── Extension Artificielle Floutée vers le haut (Aura / Déduplication) ─── */}
              {profile.headerImageUrl ? (
                <View style={styles.ambientTopWrapper} pointerEvents="none">
                  <Image
                    source={{ uri: profile.headerImageUrl }}
                    style={styles.ambientTopImage}
                    contentFit="cover"
                    blurRadius={28}
                  />
                  <View
                    style={[
                      styles.ambientTopOverlay,
                      {
                        backgroundColor: isDark
                          ? 'rgba(0, 0, 0, 0.35)'
                          : 'rgba(255, 255, 255, 0.25)',
                      },
                    ]}
                  />
                </View>
              ) : null}

              {/* Bannière de couverture principale nette et dégagée */}
              <View style={styles.coverContainer}>
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
              </View>

              {/* Avatar chevauchant la bannière & Bouton d'action */}
              <View style={styles.avatarRow}>
                <Avatar
                  user={{ name: profile.name, username: handle, logoUrl: profile.logoUrl }}
                  size="lg"
                  showCertified={profile.isCertified}
                />
                <View style={styles.actionWrap}>
                  {!isOwn && profile.type === 'PERSONAL' && profile.ownerUserId ? (
                    <Pressable
                      onPress={() => void startConversation()}
                      disabled={msgBusy}
                      accessibilityLabel={t('profile.message', 'Message')}
                      style={({ pressed }) => [
                        styles.messageButton,
                        {
                          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      {msgBusy ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Ionicons name="chatbubble-outline" size={17} color={theme.primary} />
                      )}
                    </Pressable>
                  ) : null}
                  {isOwn ? (
                    <Pressable
                      onPress={() => router.push('/settings/edit-profile')}
                      style={({ pressed }) => [
                        styles.editProfileButton,
                        {
                          backgroundColor: pressed
                            ? theme.backgroundSelected
                            : isDark
                              ? 'rgba(255, 255, 255, 0.10)'
                              : 'rgba(0, 0, 0, 0.05)',
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold" style={{ color: theme.text }}>
                        {t('profile.edit_profile', 'Modifier le profil')}
                      </ThemedText>
                    </Pressable>
                  ) : (
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
                  )}
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

                {/* Stats — abonnés/abonnements cliquables (parité Bluesky) */}
                <View style={styles.statsRow}>
                  <Pressable
                    style={styles.stat}
                    onPress={() =>
                      router.push({
                        pathname: '/user/[username]/follow',
                        params: { username: handle, tab: 'followers' },
                      })
                    }
                  >
                    <ThemedText type="smallBold">{followersCount}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {' '}
                      {t('profile.followers', 'abonnés')}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.stat}
                    onPress={() =>
                      router.push({
                        pathname: '/user/[username]/follow',
                        params: { username: handle, tab: 'following' },
                      })
                    }
                  >
                    <ThemedText type="smallBold">{profile._count?.following ?? 0}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {' '}
                      {t('profile.following_tab', 'abonnements')}
                    </ThemedText>
                  </Pressable>
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
  headerWrapper: {
    position: 'relative',
    overflow: 'visible',
  },
  ambientTopWrapper: {
    position: 'absolute',
    top: -120,
    left: -20,
    right: -20,
    height: 280,
    zIndex: 0,
    overflow: 'hidden',
  },
  ambientTopImage: {
    width: '100%',
    height: '100%',
    opacity: 0.75,
    transform: [{ scale: 1.2 }],
  },
  ambientTopOverlay: {
    ...StyleSheet.absoluteFill,
  },
  coverContainer: {
    paddingTop: 104, // Dégage la bannière nette sous le bouton retour et la barre supérieure
    zIndex: 1,
  },
  cover: {
    width: '100%',
    height: 175,
    borderRadius: 0,
  },
  coverFallback: {
    height: 135,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    marginTop: -38, // fait chevaucher harmonieusement l'avatar sur la bannière
    zIndex: 2,
  },
  actionWrap: {
    marginBottom: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
