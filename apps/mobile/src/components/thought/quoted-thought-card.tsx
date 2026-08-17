import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NormalizedThought } from './normalize';

// =====================================================================
// 💬 QuotedThoughtCard — Carte « pensée citée » (port de
//    packages/ui/social/QuotedThoughtCard.tsx)
// =====================================================================
// Affichée DANS un post de citation : l'auteur + le contenu de la pensée
// d'origine, dans une carte bordée. Tap → ouvre le fil de la pensée citée.
// =====================================================================

export function QuotedThoughtCard({ post }: { post: NormalizedThought | null }) {
  const theme = useTheme();
  if (!post) return null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/thought/[id]', params: { id: post.id } })}
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}
    >
      {/* Auteur */}
      <View style={styles.headerRow}>
        {post.author.logoUrl ? (
          <Image source={{ uri: post.author.logoUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <ThemedView type="backgroundSelected" style={[styles.avatar, styles.avatarFallback]}>
            <ThemedText style={styles.avatarInitial}>
              {(post.author.name || post.author.username || '?').charAt(0).toUpperCase()}
            </ThemedText>
          </ThemedView>
        )}
        <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
          {post.author.name || post.author.username || '…'}
        </ThemedText>
        {post.author.username ? (
          <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
            @{post.author.username}
          </ThemedText>
        ) : null}
      </View>

      {/* Contenu */}
      {post.content ? (
        <ThemedText style={styles.body} numberOfLines={6}>
          {post.content}
        </ThemedText>
      ) : null}

      {/* Image éventuelle */}
      {post.imageUrl ? (
        <Image
          source={{ uri: post.imageUrl }}
          style={[styles.image, { backgroundColor: theme.backgroundSelected }]}
          contentFit="cover"
          transition={150}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: '600',
  },
  name: {
    flexShrink: 1,
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.one,
    marginTop: Spacing.one,
  },
});
