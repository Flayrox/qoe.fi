// =====================================================================
// 🍏 NativeArticleBody.ios.tsx — Rendu Natif iOS Haute Fidélité (3-b)
// =====================================================================
// Rendu haute performance du document canonique dans UITextView natif :
//   - Modèle continu partagé C1 (article-text.ts) ;
//   - Runs homogènes calculés par attributed.ts (gras, italique, mono, marques) ;
//   - Sélection native (loupe, poignées, menu système iOS) ;
//   - Conversion continue des offsets UTF-16 -> SelectionInfo (C1) ;
//   - Parité pixel-perfect avec le reste de l'application.
// =====================================================================

import { UITextView, type SelectionChangeEvent } from '@bsky.app/react-native-uitextview';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { buildArticleText } from './article-text';
import { buildPaintSpans, MARK_ARGB, type PaintSpan } from './attributed';
import { buildNativeMarks } from './marks';
import { nativeSelectionToInfo } from './selection';
import type { NativeArticleBodyProps } from './NativeArticleBody.types';

/** ARGB int -> "rgba(r, g, b, a)" pour les styles RN de UITextView. */
function argbToRgba(argb: number): string {
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

const FONT_SIZE = 17;
const LINE_HEIGHT = 26;

function spanStyle(s: PaintSpan, linkColor: string): object {
  return [
    styles.run,
    s.bold && styles.bold,
    s.italic && styles.italic,
    s.underline && styles.underline,
    s.link && { textDecorationLine: 'underline', color: linkColor },
    s.mono && styles.mono,
    s.bg != null ? { backgroundColor: argbToRgba(s.bg) } : null,
  ];
}

export function NativeArticleBodyIOS({
  document,
  highlights = [],
  onSelect,
  spotlight,
}: NativeArticleBodyProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // 1. Modèle continu depuis le document canonique
  const model = useMemo(() => buildArticleText(document), [document]);
  const text = model.text;

  // 2. Marques unifiées (surlignages officiels, privés, publics, spotlight)
  const coloredMarks = useMemo(() => {
    const nativeMarks = buildNativeMarks(model, {
      highlights,
      spotlight,
    });
    return nativeMarks.map((m) => ({
      startCp: m.startCp,
      endCp: m.endCp,
      color: MARK_ARGB[m.kind] ?? 0,
    }));
  }, [model, highlights, spotlight]);

  // 3. Runs homogènes prêts pour UITextView
  const spans = useMemo(() => buildPaintSpans(model, coloredMarks), [model, coloredMarks]);

  // 4. Gestion de la sélection native iOS
  const handleSelectionChange = useCallback(
    (e: SelectionChangeEvent) => {
      const { start, end } = e.nativeEvent;
      if (start === end || start < 0 || end <= start) {
        onSelect(null);
        return;
      }
      const info = nativeSelectionToInfo(model, start, end);
      if (!info) {
        onSelect(null);
        return;
      }
      // Sur iOS (3-b), SelectionInfo complet
      onSelect({
        index: info.index,
        text: info.text,
        y: 0,
        from: '',
        to: '',
        canonicalStart: info.canonicalStart,
        canonicalEnd: info.canonicalEnd,
      });
    },
    [model, onSelect]
  );

  // Largeur utile calée sur le conteneur standard (padding horizontal 16 + 16 = 32)
  const contentWidth = Math.max(0, screenWidth - 32);

  return (
    <View style={styles.container}>
      <UITextView
        uiTextView
        selectable
        onSelectionChange={handleSelectionChange}
        style={[
          styles.article,
          {
            color: theme.text,
            width: contentWidth,
            maxWidth: contentWidth,
          },
        ]}
      >
        {spans.map((s, i) => (
          <UITextView key={i} style={spanStyle(s, theme.primary)}>
            {text.slice(s.start, s.end)}
          </UITextView>
        ))}
      </UITextView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  article: {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
  },
  run: {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  mono: {
    fontFamily: 'Menlo',
  },
});
