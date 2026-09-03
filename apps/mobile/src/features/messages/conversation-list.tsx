// =====================================================================
// 💬 ConversationList — Liste des conversations directes (mobile)
// =====================================================================
// GET /v1/conversations via QoeApiClient, polling 8 s (tranche 1 : pas
// encore de Realtime). Tap → écran de fil /conversation/[id].
// Réutilisée : moitié basse du Centre d'Activité + onglet Messages.
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Avatar } from '@/components/thought/avatar';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorMessage } from '@/components/ui/error-message';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Conversation } from '@qoe/sdk/mobile';
import { conversationKeys } from '@qoe/sdk/mobile';

const POLL_MS = 8000;

function nameOf(c: Conversation): string {
  return c.participant.name || c.participant.username || t('messages.user', 'Utilisateur');
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return t('messages.yesterday', 'hier');
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress?: (conversation: Conversation) => void;
}) {
  const theme = useTheme();
  const last = conversation.lastMessage;
  const mine = last && last.senderId !== conversation.participant.id;

  return (
    <Pressable
      onPress={() => onPress?.(conversation)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <Avatar
        user={{
          name: conversation.participant.name,
          username: conversation.participant.username,
          logoUrl: conversation.participant.logoUrl,
        }}
        size="md"
        showCertified={conversation.participant.isCertified}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.rowName}>
            {nameOf(conversation)}
          </ThemedText>
          {last ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 11 }}>
              {timeLabel(last.createdAt)}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.rowBottom}>
          <ThemedText
            type="small"
            numberOfLines={1}
            style={[styles.rowPreview, { color: theme.textSecondary }]}
          >
            {last
              ? mine
                ? t('messages.you_prefix', 'Vous :') + ' ' + last.content
                : last.content
              : t('messages.empty_thread', 'Nouvelle conversation')}
          </ThemedText>
          {conversation.unreadCount > 0 ? (
            <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
              <ThemedText
                type="smallBold"
                style={{ color: '#ffffff', fontSize: 10, lineHeight: 14 }}
              >
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function ConversationList({
  style,
  onSelect,
}: {
  style?: ViewStyle;
  onSelect?: (conversation: Conversation) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: conversationKeys.list(),
    queryFn: async () => {
      const res = await apiClient.getConversations();
      if (!res.ok) throw new Error(res.error);
      return res.data.conversations;
    },
    refetchInterval: POLL_MS,
  });

  const conversations = useMemo(() => data ?? [], [data]);

  const handleSelect = useCallback(
    (conversation: Conversation) => {
      if (onSelect) {
        onSelect(conversation);
        return;
      }
      router.push({
        pathname: '/conversation/[id]',
        params: { id: conversation.id },
      });
    },
    [router, onSelect]
  );

  if (isPending) {
    return (
      <View style={[styles.center, style]}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t('common.loading', 'Chargement...')}
        </ThemedText>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <ErrorMessage
          message={t('messages.load_error', 'Impossible de charger les conversations')}
          onPressTryAgain={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <FlashList
      style={style}
      data={conversations}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <ConversationRow conversation={item} onPress={handleSelect} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      ListEmptyComponent={
        <EmptyState
          icon={{ ios: 'bubble.left.and.bubble.right', android: 'chat', web: 'chat' }}
          message={t('messages.empty', 'Aucune conversation. Envoyez un message depuis un profil.')}
        />
      }
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: theme.border }]} />
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: 2,
  },
  rowPreview: {
    flex: 1,
    fontSize: 13,
  },
  unreadPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 76,
  },
});
