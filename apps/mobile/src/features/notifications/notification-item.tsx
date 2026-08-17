// =====================================================================
// 🔔 NotificationItem — Une notification groupée (port de
//    .reference/bluesky/src/view/com/notifications/NotificationFeedItem.tsx)
// =====================================================================
// Colonne icône (type) + avatars des expéditeurs + message + temps relatif.
// Surligne les non-lues (fond primaire léger). Tap → ouvre la pensée/l'article.
// =====================================================================

import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { TimeElapsed } from '@/components/thought/time-elapsed';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { AppNotification } from '@qoe/api-client/mobile';

const MAX_AUTHORS = 3;

function typeIcon(type: AppNotification['type']): SymbolViewProps['name'] {
  switch (type) {
    case 'LIKE':
      return { ios: 'heart.fill', android: 'favorite', web: 'favorite' };
    case 'REPLY':
    case 'MENTION':
    case 'COMMENT':
      return { ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' };
    case 'REPOST':
      return { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' };
    case 'FOLLOW':
      return { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' };
    case 'MEDIA_INVITE':
    case 'MEDIA_MEMBER_JOINED':
      return { ios: 'person.2.fill', android: 'group', web: 'group' };
    default:
      return { ios: 'bell.fill', android: 'notifications', web: 'notifications' };
  }
}

function typeColor(type: AppNotification['type'], theme: ReturnType<typeof useTheme>): string {
  switch (type) {
    case 'LIKE':
      return theme.primary;
    case 'REPOST':
      return theme.success;
    case 'FOLLOW':
      return theme.primary;
    default:
      return theme.textSecondary;
  }
}

function message(n: AppNotification): string {
  const names = n.senders.slice(0, MAX_AUTHORS).map((s) => s.name || s.username || '?');
  const joined = names.join(', ');
  const extra =
    n.senders.length > MAX_AUTHORS ? ` et ${n.senders.length - MAX_AUTHORS} autres` : '';
  const who = `${joined}${extra}`;
  switch (n.type) {
    case 'LIKE':
      return t('notif.like', `${who} ont aimé votre pensée`);
    case 'REPLY':
      return t('notif.reply', `${who} ont répondu à votre pensée`);
    case 'MENTION':
      return t('notif.mention', `${who} vous ont mentionné`);
    case 'REPOST':
      return t('notif.repost', `${who} ont repartagé votre pensée`);
    case 'FOLLOW':
      return t('notif.follow', `${who} vous suivent`);
    case 'COMMENT':
      return t('notif.comment', `${who} ont commenté votre article`);
    case 'MEDIA_INVITE':
      return t('notif.media_invite', `${who} vous invitent à rejoindre leur publication`);
    case 'MEDIA_MEMBER_JOINED':
      return t('notif.media_joined', `${who} ont rejoint votre publication`);
    default:
      return who;
  }
}

export function NotificationItem({ notification }: { notification: AppNotification }) {
  const theme = useTheme();
  const icon = typeIcon(notification.type);
  const color = typeColor(notification.type, theme);

  const open = () => {
    if (notification.thoughtId) {
      router.push({ pathname: '/thought/[id]', params: { id: notification.thoughtId } });
    } else if (notification.articleId) {
      router.push({
        pathname: '/article/[slug]',
        params: { slug: notification.article?.slug ?? notification.articleId },
      });
    }
  };

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        !notification.isRead && { backgroundColor: 'rgba(0,0,0,0.03)' },
        pressed && styles.pressed,
      ]}
    >
      {/* Colonne icône type */}
      <View style={styles.iconCol}>
        <SymbolView name={icon} size={20} tintColor={color} weight="regular" />
      </View>

      {/* Colonne contenu */}
      <View style={styles.content}>
        <View style={styles.avatars}>
          {notification.senders.slice(0, MAX_AUTHORS).map((s) => (
            <View key={s.id} style={styles.avatarWrap}>
              {s.logoUrl ? (
                <Image source={{ uri: s.logoUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarFallback,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <ThemedText style={styles.avatarInitial}>
                    {(s.name || s.username || '?').charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
            </View>
          ))}
        </View>
        <ThemedText type="small" numberOfLines={3} style={styles.msg}>
          {message(notification)}
        </ThemedText>
        {notification.thought?.content ? (
          <ThemedText type="small" numberOfLines={2} style={{ color: theme.textSecondary }}>
            « {notification.thought.content.slice(0, 140)} »
          </ThemedText>
        ) : null}
        <TimeElapsed timestamp={notification.createdAt} />
      </View>

      {/* Pastille non-lue */}
      {!notification.isRead ? (
        <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
  iconCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  avatars: {
    flexDirection: 'row',
    gap: -8,
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 999,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: '600',
  },
  msg: {
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: Spacing.two,
  },
});
