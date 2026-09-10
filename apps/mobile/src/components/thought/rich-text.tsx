// =====================================================================
// ✍️ RichText — Rendu de texte avec liens / mentions / hashtags détectés
//    (port de .reference/bluesky/src/components/RichText.tsx)
// =====================================================================
// Segmente le texte en tokens : URL → lien (expo-web-browser),
// @mention → profil, #tag → recherche. Le reste est du texte brut.
// =====================================================================

import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import {
  segmentText,
  URL_REGEX,
  MENTION_REGEX,
  TAG_REGEX,
  type TextSegment as Segment,
} from '@qoe/social';

export function RichText({
  value,
  style,
  numberOfLines,
  authorHandle,
  onLinkPress,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  authorHandle?: string | null;
  onLinkPress?: (url: string) => void;
}) {
  const theme = useTheme();
  const segments = useMemo(() => segmentText(value || ''), [value]);

  const openLink = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
      return;
    }
    void WebBrowser.openBrowserAsync(url);
  };

  const openMention = (handle: string) => {
    router.push({ pathname: '/user/[username]', params: { username: handle } });
  };

  const openTag = (tag: string) => {
    // Pas de route tag dédiée : on ouvre l'explorer (recherche à venir).
    router.push({ pathname: '/(tabs)/explore', params: { q: tag } });
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) => {
        if (seg.kind === 'link') {
          return (
            <Text key={i} style={styles.link} onPress={() => openLink(seg.url)}>
              {seg.value}
            </Text>
          );
        }
        if (seg.kind === 'mention') {
          const isSelf = authorHandle && seg.handle === authorHandle;
          return (
            <Text
              key={i}
              style={[styles.mention, { color: isSelf ? theme.textSecondary : theme.primary }]}
              onPress={() => openMention(seg.handle)}
            >
              {seg.value}
            </Text>
          );
        }
        if (seg.kind === 'tag') {
          return (
            <Text key={i} style={styles.link} onPress={() => openTag(seg.tag)}>
              {seg.value}
            </Text>
          );
        }
        return <Text key={i}>{seg.value}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#0b6bcb',
    textDecorationLine: 'underline',
  },
  mention: {
    fontWeight: '600',
  },
});

// Ré-export pour les tests / réutilisation.
export { URL_REGEX, MENTION_REGEX, TAG_REGEX, segmentText };
