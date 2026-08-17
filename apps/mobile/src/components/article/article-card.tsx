import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/thought/avatar';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { FeedArticle } from '@qoe/api-client/mobile';

// =====================================================================
// 🗞️ ArticleCard — Carte d'article du feed mobile (port de
//    apps/feed/.../ArticleCard.tsx — l'« écran principal » web)
// =====================================================================
// Même design que le web : image de couverture (logo de la publication en
// fallback), barre auteur (avatar + nom + date) superposée, titre, extrait,
// pied (catégorie · temps de lecture · premium · signet). Tap → article.
// =====================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ArticleCard({ article }: { article: FeedArticle }) {
  const theme = useTheme();

  const publicationName = article.publication?.name || 'qoe.fi';
  const authorName = article.author?.name || publicationName;
  const handle = article.author?.username || article.publication?.slug || 'qoe.fi';
  const coverImage = article.publication?.logoUrl || article.author?.logoUrl || null;
  const excerpt = stripHtml(article.content || '').slice(0, 140);
  const date = new Date(article.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });

  const openArticle = () => {
    router.push({
      pathname: '/article/[slug]',
      params: { slug: article.slug, publicationId: article.publicationId },
    });
  };

  const openProfile = () => {
    if (!handle) return;
    router.push({ pathname: '/user/[username]', params: { username: handle } });
  };

  return (
    <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
      {/* Image de couverture + barre auteur superposée */}
      <View style={[styles.coverWrap, { backgroundColor: theme.backgroundSelected }]}>
        {coverImage ? (
          <Image
            source={{ uri: coverImage }}
            style={styles.cover}
            contentFit="cover"
            transition={200}
          />
        ) : null}
        <View style={styles.coverScrim} />

        <View style={styles.coverBar}>
          <Pressable onPress={openProfile} hitSlop={6}>
            <Avatar
              user={{ name: authorName, username: handle, logoUrl: coverImage }}
              size="sm"
              showCertified={article.author?.isCertified}
            />
          </Pressable>
          <Pressable onPress={openProfile} style={styles.coverMeta}>
            <ThemedText numberOfLines={1} style={styles.coverName}>
              {authorName}
            </ThemedText>
            <ThemedText type="small" numberOfLines={1} style={styles.coverHandle}>
              · {date}
            </ThemedText>
          </Pressable>
          {article.isPremium ? (
            <ThemedText type="small" style={styles.crown}>
              👑
            </ThemedText>
          ) : null}
        </View>
      </View>

      {/* Titre + extrait (tap → article) */}
      <Pressable onPress={openArticle} style={styles.body}>
        <ThemedText style={styles.title} numberOfLines={2}>
          {article.title}
        </ThemedText>
        {excerpt ? (
          <ThemedText type="small" numberOfLines={2} style={styles.excerpt}>
            {excerpt}
          </ThemedText>
        ) : null}
      </Pressable>

      {/* Pied : catégorie · lecture · signet */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <View style={styles.footerLeft}>
          {article.category?.name ? (
            <ThemedText type="small" numberOfLines={1} style={styles.category}>
              {article.category.name}
            </ThemedText>
          ) : null}
          {article.readingTime > 0 ? (
            <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
              ⏱ {article.readingTime} {t('article.min_read', 'min')}
            </ThemedText>
          ) : null}
        </View>
        <Pressable onPress={openArticle} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {t('article.read', 'Lire')} →
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverWrap: {
    height: 160,
    justifyContent: 'flex-end',
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  coverMeta: {
    flex: 1,
    minWidth: 0,
  },
  coverName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  coverHandle: {
    color: 'rgba(255,255,255,0.8)',
  },
  crown: {
    fontSize: 14,
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  excerpt: {
    color: 'rgba(0,0,0,0.55)',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  category: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
