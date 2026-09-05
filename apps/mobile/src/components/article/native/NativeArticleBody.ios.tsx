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
import { useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';

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
  selection,
  onSelect,
  spotlight,
}: NativeArticleBodyProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, screenWidth - 32);
  const linesRef = useRef<
    { x: number; y: number; width: number; height: number; start: number; end: number }[]
  >([]);

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

  const handleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      let offset = 0;
      linesRef.current = (e.nativeEvent.lines ?? []).map((l: any, idx: number) => {
        const lineText = typeof l === 'string' ? l : (l?.text ?? '');
        const len = lineText.length;
        const start = offset;
        const end = offset + len;
        offset = end;
        return {
          x: typeof l === 'object' && l && typeof l.x === 'number' ? l.x : 0,
          width: typeof l === 'object' && l && typeof l.width === 'number' ? l.width : contentWidth,
          y: typeof l === 'object' && l && typeof l.y === 'number' ? l.y : idx * LINE_HEIGHT,
          height:
            typeof l === 'object' && l && typeof l.height === 'number' ? l.height : LINE_HEIGHT,
          start,
          end,
        };
      });
    },
    [contentWidth]
  );

  // 4. Gestion de la sélection native iOS
  const handleSelectionChange = useCallback(
    (e: SelectionChangeEvent) => {
      const { start, end } = e.nativeEvent;
      if (start === end || start < 0 || end <= start) {
        if (!selection) {
          onSelect(null);
        }
        return;
      }
      const info = nativeSelectionToInfo(model, start, end);
      if (!info) {
        if (!selection) {
          onSelect(null);
        }
        return;
      }

      // Ancrage géométrique de la popover au niveau de la 1re ligne sélectionnée
      let yCenter = 0;
      let xCenter = contentWidth / 2;
      const lines = linesRef.current;
      for (const line of lines) {
        if (start >= line.start && start <= line.end) {
          yCenter = line.y + line.height / 2;
          const lineLen = Math.max(1, line.end - line.start);
          const selStartInLine = Math.max(0, start - line.start);
          const selEndInLine = Math.min(lineLen, end - line.start);
          const midRatio = (selStartInLine + selEndInLine) / (2 * lineLen);
          xCenter = line.x + midRatio * line.width;
          break;
        }
      }
      if (yCenter === 0) {
        if (lines.length > 0) {
          const totalChars = lines[lines.length - 1]?.end || 1;
          const totalHeight = lines.length * LINE_HEIGHT;
          yCenter = Math.min((start / totalChars) * totalHeight, totalHeight - LINE_HEIGHT / 2);
        } else {
          // Estimation de secours avant onTextLayout : ~45 caractères par ligne
          const approxCharsPerLine = Math.max(20, Math.floor(contentWidth / 9));
          const approxLine = Math.floor(start / approxCharsPerLine);
          yCenter = approxLine * LINE_HEIGHT + LINE_HEIGHT / 2;
        }
      }

      onSelect({
        index: info.index,
        text: info.text,
        y: yCenter,
        x: xCenter,
        from: '',
        to: '',
        canonicalStart: info.canonicalStart,
        canonicalEnd: info.canonicalEnd,
      });
    },
    [contentWidth, model, onSelect, selection]
  );

  return (
    <View style={styles.container}>
      <UITextView
        uiTextView
        selectable
        selectionColor={theme.primary}
        onSelectionChange={handleSelectionChange}
        onTextLayout={handleTextLayout}
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
