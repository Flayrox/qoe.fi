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

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const MENTION_REGEX = /(^|\s)(@[a-zA-Z0-9_.-]+)/g;
const TAG_REGEX = /(^|\s)(#[a-zA-Z0-9_à-ÿ-]+)/g;

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; url: string }
  | { kind: 'mention'; value: string; handle: string }
  | { kind: 'tag'; value: string; tag: string };

/** Détecte URL + mentions + hashtags dans un texte (facets simplifiées). */
export function segmentText(text: string): Segment[] {
  const matches: { start: number; end: number; seg: Segment }[] = [];

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      seg: { kind: 'link', value: m[0], url: m[0] },
    });
  }

  const mentionRegex = /(^|\s)(@[a-zA-Z0-9_.-]+)/g;
  while ((m = mentionRegex.exec(text)) !== null) {
    const handle = m[2].slice(1);
    matches.push({
      start: m.index + m[1].length,
      end: m.index + m[0].length,
      seg: { kind: 'mention', value: m[2], handle },
    });
  }

  const tagRegex = /(^|\s)(#[a-zA-Z0-9_à-ÿ-]+)/g;
  while ((m = tagRegex.exec(text)) !== null) {
    const tag = m[2].slice(1);
    matches.push({
      start: m.index + m[1].length,
      end: m.index + m[0].length,
      seg: { kind: 'tag', value: m[2], tag },
    });
  }

  if (matches.length === 0) return [{ kind: 'text', value: text }];

  // Trie + fusionne les recouvrements (URL prioritaire sur mention/tag).
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, match.start) });
    }
    segments.push(match.seg);
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }
  return segments;
}

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
export { URL_REGEX, MENTION_REGEX, TAG_REGEX };
