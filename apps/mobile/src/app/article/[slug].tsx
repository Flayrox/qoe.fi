import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ArticleScreen } from '@/features/article/article-screen';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { parseSpotlightParams } from '@qoe/sdk/spotlight';

// =====================================================================
// 📖 Route /article/[slug] — Lecture d'un article.
// Paramètres : `slug` (route) + `publisherId` (query, requis par le Go),
// et le deep-link citation → article (6-b/6-d) : hlStart/hlEnd/hlSha — le
// passage cité est peint et le lecteur scrolle dessus.
// =====================================================================
export default function ArticleRoute() {
  const params = useLocalSearchParams<{
    slug: string;
    publisherId?: string;
    hlStart?: string;
    hlEnd?: string;
    hlSha?: string;
  }>();
  const slug = params.slug;
  const publisherId = params.publisherId;

  if (!slug) return null;
  // Sans publisherId, on invite à revenir (le Go répondrait 400).
  if (!publisherId) {
    return <ArticleMissingPublisher onBack={() => router.back()} />;
  }
  // 🔦 Strictement validé — toute entrée invalide → null (lecture normale).
  const spotlight = parseSpotlightParams(params);
  return <ArticleScreen slug={slug} publisherId={publisherId} spotlight={spotlight} />;
}

function ArticleMissingPublisher({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.center}>
      <ThemedText type="small">{t('article.missing_pub', 'Article indisponible')}</ThemedText>
      <Pressable onPress={onBack}>
        <ThemedText type="small" style={{ color: theme.primary }}>
          {t('common.back', 'Retour')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
