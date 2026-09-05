// =====================================================================
// 🤖 NativeArticleBody.android.tsx — Rendu Natif Android (Tranche 4)
// =====================================================================
// Rendu haute performance du document canonique dans ArticleTextView natif :
//   - Modèle continu partagé C1 (article-text.ts) ;
//   - Spans & Layouts de paragraphes calculés par attributed.ts (4-b) ;
//   - Sélection native → SelectionPopover (4-c) ;
//   - Spotlight deep-link (4-d).
// =====================================================================

import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  ArticleTextView,
  type ArticleTextViewContentHeight,
  type ArticleTextViewSelection,
  type ArticleTextViewSpotlightMeasured,
} from '../../../../modules/article-text-view/src';
import { useTheme } from '@/hooks/use-theme';

import { buildArticleText, canonicalToDisplayCpRange, cpToUtf16 } from './article-text';
import { buildPaintSpans, buildParagraphLayouts, MARK_ARGB } from './attributed';
import { buildNativeMarks } from './marks';
import { nativeSelectionToPopoverInfo } from './selection';
import type { NativeArticleBodyProps } from './NativeArticleBody.types';

function hexToArgb(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return 0xff000000 | (Number.isNaN(v) ? 0x111111 : v);
}

const FONT_SIZE = 17;
const LINE_HEIGHT = 26;

export function NativeArticleBodyAndroid({
  document,
  highlights = [],
  selection,
  onSelect,
  spotlight,
  onSpotlightMeasured,
}: NativeArticleBodyProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  // 1. Modèle continu depuis le document canonique
  const model = useMemo(() => buildArticleText(document), [document]);

  // 2. Marques (surlignages + spotlight optionnel)
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

  // 3. Spans de styles inline et fond des marques (bg absent = -1 car Kotlin n'accepte pas null dans Map)
  const spans = useMemo(
    () =>
      buildPaintSpans(model, coloredMarks).map((s) => ({
        start: s.start,
        end: s.end,
        bold: s.bold,
        italic: s.italic,
        underline: s.underline,
        mono: s.mono,
        link: s.link,
        bg: s.bg ?? -1,
      })),
    [model, coloredMarks]
  );

  // 4. Paragraphes structurés (titres, citations, listes, code) sans valeurs null/undefined
  const paragraphs = useMemo(
    () =>
      buildParagraphLayouts(model).map((p) => {
        const o: any = { start: p.start, end: p.end, kind: p.kind };
        if (p.listItem) {
          o.listItem = true;
          if (p.orderedIndex !== undefined) o.orderedIndex = p.orderedIndex;
          if (p.markerText) o.markerText = p.markerText;
        }
        return o;
      }),
    [model]
  );

  // 5. Offset UTF-16 du spotlight pour la mesure native
  const spotlightUtf16Start = useMemo(() => {
    if (!spotlight || spotlight.sha !== document.sha) return -1;
    const r = canonicalToDisplayCpRange(model, spotlight.start, spotlight.end);
    if (!r) return -1;
    return cpToUtf16(model.text, r.startCp);
  }, [model, spotlight, document.sha]);

  // 6. Couleurs du thème converties en ARGB pour Android
  const textColor = useMemo(() => hexToArgb(theme.text), [theme.text]);
  const linkColor = useMemo(() => hexToArgb(theme.primary), [theme.primary]);
  const selectionColor = useMemo(() => hexToArgb(theme.primary), [theme.primary]);

  // 7. Handlers natifs
  const handleSelectionChange = useCallback(
    (e: { nativeEvent: ArticleTextViewSelection }) => {
      const { location, length, y, x } = e.nativeEvent;
      if (location < 0 || length <= 0) {
        // Ne pas écraser une sélection déjà active (ex: focus déplacé vers le composer,
        // tap sur un bouton de la popover). La popover se ferme via son backdrop ou onClose.
        if (!selection) {
          onSelect(null);
        }
        return;
      }
      const info = nativeSelectionToPopoverInfo(model, location, location + length, y ?? 0, x);
      onSelect(info);
    },
    [model, onSelect, selection]
  );

  const handleContentHeight = useCallback((e: { nativeEvent: ArticleTextViewContentHeight }) => {
    const h = e.nativeEvent.height;
    if (h > 0) {
      setContentHeight(Math.ceil(h));
    }
  }, []);

  const handleSpotlightMeasured = useCallback(
    (e: { nativeEvent: ArticleTextViewSpotlightMeasured }) => {
      const { y } = e.nativeEvent;
      if (onSpotlightMeasured) {
        onSpotlightMeasured(y);
      }
    },
    [onSpotlightMeasured]
  );

  // Largeur utile pour le rendu (déduit le padding horizontal standard 16 + 16 = 32)
  const measureWidth = Math.max(0, screenWidth - 32);

  return (
    <View style={styles.container}>
      <ArticleTextView
        text={model.text}
        spans={spans}
        paragraphs={paragraphs}
        textColor={textColor}
        linkColor={linkColor}
        selectionColor={selectionColor}
        fontSize={FONT_SIZE}
        lineHeight={LINE_HEIGHT}
        measureWidth={measureWidth}
        onSelectionChange={handleSelectionChange}
        onContentHeight={handleContentHeight}
        spotlightStart={spotlightUtf16Start}
        onSpotlightMeasured={handleSpotlightMeasured}
        style={[styles.textView, contentHeight ? { height: contentHeight } : { minHeight: 200 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  textView: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
