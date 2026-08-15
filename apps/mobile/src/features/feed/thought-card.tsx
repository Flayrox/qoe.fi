import type { ThoughtData } from '@qoe/api-client/mobile';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('feed.just_now', "à l'instant");
  if (minutes < 60) return t('feed.minutes_ago', 'il y a {minutes} min', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('feed.hours_ago', 'il y a {hours} h', { hours });
  const days = Math.floor(hours / 24);
  return t('feed.days_ago', 'il y a {days} j', { days });
}

export function ThoughtCard({ thought }: { thought: ThoughtData }) {
  const theme = useTheme();
  const authorName = thought.author?.name ?? thought.author?.username ?? '?';
  const handle = thought.author?.username ? `@${thought.author.username}` : null;
  const logoUrl = thought.author?.logoUrl;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{authorName.charAt(0).toUpperCase()}</ThemedText>
          </View>
        )}
        <View style={styles.authorMeta}>
          <ThemedText type="small" numberOfLines={1}>
            {authorName}
          </ThemedText>
          {handle ? (
            <ThemedText type="small" style={styles.handle}>
              {handle}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" style={styles.time}>
          {relativeTime(thought.createdAt)}
        </ThemedText>
      </View>

      {thought.content ? <ThemedText style={styles.content}>{thought.content}</ThemedText> : null}

      {thought.likeCount > 0 || thought.repostCount > 0 ? (
        <View style={styles.meta}>
          {thought.likeCount > 0 ? (
            <ThemedText type="small">
              {thought.likeCount} {t('feed.likes', 'likes')}
            </ThemedText>
          ) : null}
          {thought.repostCount > 0 ? (
            <ThemedText type="small">
              {thought.repostCount} {t('feed.reposts', 'reposts')}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  authorMeta: {
    flex: 1,
  },
  handle: {
    opacity: 0.6,
  },
  time: {
    opacity: 0.6,
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.three,
    opacity: 0.7,
  },
});
