import { router } from 'expo-router';
import { ArrowUpRight, Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import type { NormalizedQuotedArticle } from './normalize';

// =====================================================================
// 📰 QuotedArticleCard — Carte « article cité » du feed (port mobile de
//    packages/ui/social/QuotedArticleCard.tsx)
// =====================================================================
// Affiche l'article cité par une pensée avec le CONTEXTE DU PASSAGE résolu
// par le serveur (tranche 6-a) : avant / passage surligné / après — plus
// aucun strip HTML ni recherche d'extrait côté client.
// Tap → le lecteur mobile, avec les offsets du passage (deep-link 6-b,
// consommés par le lecteur à la tranche 6-d).
// =====================================================================

export function QuotedArticleCard({ article }: { article: NormalizedQuotedArticle | null }) {
  const theme = useTheme();
  if (!article) return null;

  const domain = article.publication?.subdomain || article.publication?.customDomain;
  const displayDomain = (domain || article.publication?.slug || 'qoe.fi').replace(
    /^https?:\/\//,
    ''
  );

  const context = article.quoteContext;

  const openArticle = () => {
    const params: {
      slug: string;
      publicationId: string;
      hlStart?: string;
      hlEnd?: string;
      hlSha?: string;
    } = {
      slug: article.slug,
      publicationId: article.publication.id,
    };
    // 🔦 Deep-link prêt (tranche 6-b) : le lecteur mettra le passage en
    // avant quand le câblage mobile (6-d) sera en place.
    if (context && typeof context.start === 'number' && typeof context.end === 'number') {
      params.hlStart = String(context.start);
      params.hlEnd = String(context.end);
      params.hlSha = context.sha;
    }
    router.push({ pathname: '/article/[slug]', params });
  };

  return (
    <Pressable
      onPress={openArticle}
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}
    >
      {/* Liseré latéral discret */}
      <View style={[styles.accent, { backgroundColor: theme.primary }]} />

      {/* Domaine + type + premium */}
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.domain}>
          {displayDomain}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          · {t('quote.article', 'Article')}
        </ThemedText>
        {article.isPremium ? (
          <View style={[styles.premiumBadge, { borderColor: theme.primary }]}>
            <Lock size={9} color={theme.primary} />
            <ThemedText type="small" style={[styles.premiumLabel, { color: theme.primary }]}>
              {t('quote.premium', 'Premium')}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <ArrowUpRight size={13} color={theme.textSecondary} />
      </View>

      {/* Titre */}
      <ThemedText numberOfLines={2} style={styles.title}>
        {article.title}
      </ThemedText>

      {/* Passage cité (contexte serveur) */}
      {context?.highlight ? (
        <View style={[styles.quote, { borderLeftColor: theme.primary }]}>
          <ThemedText type="small" style={styles.quoteText} numberOfLines={4}>
            {context.before ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {context.before}{' '}
              </ThemedText>
            ) : null}
            <ThemedText type="small" style={[styles.highlight, { color: theme.primary }]}>
              {context.highlight}
            </ThemedText>
            {context.after ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {' '}
                {context.after}
              </ThemedText>
            ) : null}
          </ThemedText>
        </View>
      ) : null}

      {/* Footer */}
      <View style={[styles.footerRow, { borderTopColor: theme.border }]}>
        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
          {t('quote.by', 'Par')}{' '}
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            {article.author?.name || article.author?.username || t('quote.author', 'Auteur')}
          </ThemedText>
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.primary }}>
          {t('quote.read_article', "Lire l'article")}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two + Spacing.one,
    marginTop: Spacing.two,
    gap: Spacing.one,
    overflow: 'hidden',
    position: 'relative',
  },
  pressed: {
    opacity: 0.7,
  },
  accent: {
    position: 'absolute',
    top: Spacing.two,
    bottom: Spacing.two,
    left: 0,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  domain: {
    maxWidth: '55%',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  premiumLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  spacer: {
    flex: 1,
  },
  title: {
    lineHeight: 20,
  },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.two,
    paddingVertical: 1,
  },
  quoteText: {
    lineHeight: 18,
  },
  highlight: {
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
});
