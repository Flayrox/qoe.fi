// =====================================================================
// 🔗 ExternalEmbed — Carte de lien (port de
//    .reference/bluesky/src/components/Post/Embed/ExternalEmbed)
// =====================================================================
// Affiche une carte tappable pour la première URL détectée dans le texte :
// domaine + URL tronquée. (La résolution de titre/description/OG-image
// n'est pas faite côté Go — extension future.)
// =====================================================================

import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View, Pressable } from 'react-native';

import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function ExternalEmbed({ url }: { url: string }) {
  const theme = useTheme();
  const host = hostOf(url);

  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
    >
      <View style={[styles.favicon, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView
          name={{ ios: 'globe', android: 'public', web: 'public' }}
          size={18}
          tintColor={theme.textSecondary}
          weight="regular"
        />
      </View>
      <View style={styles.meta}>
        <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '700' }}>
          {host}
        </ThemedText>
        <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
          {url}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'arrow.up.right.square', android: 'open_in_new', web: 'open_in_new' }}
        size={16}
        tintColor={theme.textSecondary}
        weight="regular"
      />
    </Pressable>
  );
}

/** Carte link à afficher sous un post si son texte contient une URL. */
export function ExternalEmbedFromText({ text }: { text: string }) {
  const url = extractFirstUrl(text);
  if (!url) return null;
  return <ExternalEmbed url={url} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.two,
    marginTop: Spacing.two,
  },
  favicon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
});
