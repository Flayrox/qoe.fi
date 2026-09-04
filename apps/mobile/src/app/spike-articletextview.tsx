// =====================================================================
// 🧪 spike-articletextview.tsx — Spike 4-b (tranche 4) : rendu de bloc
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après la tranche) : rend l'« article
// témoin » partagé (demo-doc.ts) à travers le modèle C1 puis les helpers
// de peinture partagés (attributed.ts) dans le module natif maison
// `ArticleTextView` :
//   - spans : runs homogènes (gras/italique/souligné/mono/lien + fond des
//     marques) — LES MÊMES que le rendu iOS (parité par construction) ;
//   - paragraphs : layout de bloc (h2, blockquote, code, listes) — titres
//     agrandis, filet de citation, fond monospace, retrait suspendu.
// La barre ActionMode système est NEUTRALISÉE côté natif (nos actions
// vivront dans la surface morphée en 4-c) — les poignées restent natives.
// La hauteur du contenu est mesurée côté natif (StaticLayout sur le texte
// spané — les titres agrandis comptent) et remontée par onContentHeight :
// plus de « jumeau » RN.
// =====================================================================

import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ArticleTextView,
  type ArticleTextViewParagraph,
  type ArticleTextViewSelection,
} from '../../modules/article-text-view/src';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { buildArticleText } from '@/components/article/native/article-text';
import {
  buildPaintSpans,
  buildParagraphLayouts,
  MARK_ARGB,
} from '@/components/article/native/attributed';
import { buildNativeMarks } from '@/components/article/native/marks';
import {
  DEMO_DOC,
  DEMO_PRIVATE_HIGHLIGHT,
  DEMO_PUBLIC_HIGHLIGHT,
} from '@/components/article/native/demo-doc';
import { nativeSelectionToInfo } from '@/components/article/native/selection';

/** rgba("r, g, b, a") → ARGB int. */
function hexToArgb(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return 0xff000000 | (Number.isNaN(v) ? 0x111111 : v);
}

const FONT_SIZE = 17;
const LINE_HEIGHT = 26;

function ArticleSpike() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Spike ArticleTextView (4-b)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Article témoin : titres, citations, listes, code — barre système neutralisée.
        </ThemedText>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <DocView />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rendu du témoin partagé dans l'ArticleTextView natif. */
function DocView() {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [sel, setSel] = useState<string>('—');
  const [heightDp, setHeightDp] = useState<number | null>(null);

  const model = buildArticleText(DEMO_DOC);
  const text = model.text;

  // Marques du témoin (officielles du doc + public + private) → ARGB.
  const coloredMarks = buildNativeMarks(model, {
    highlights: [DEMO_PUBLIC_HIGHLIGHT, DEMO_PRIVATE_HIGHLIGHT],
  }).map((m) => ({ startCp: m.startCp, endCp: m.endCp, color: MARK_ARGB[m.kind] ?? 0 }));

  // Runs homogènes (attributs + fond) + layout de bloc, en UTF-16.
  // Le bridge natif n'accepte pas null dans les maps : fond absent = -1,
  // clés facultatives omises quand inutiles.
  const spans = buildPaintSpans(model, coloredMarks).map((s) => ({
    start: s.start,
    end: s.end,
    bold: s.bold,
    italic: s.italic,
    underline: s.underline,
    mono: s.mono,
    link: s.link,
    bg: s.bg ?? -1,
  }));
  const paragraphs: ArticleTextViewParagraph[] = buildParagraphLayouts(model).map((p) => {
    const o: ArticleTextViewParagraph = { start: p.start, end: p.end, kind: p.kind };
    if (p.listItem) {
      o.listItem = true;
      if (p.orderedIndex !== undefined) o.orderedIndex = p.orderedIndex;
      if (p.markerText) o.markerText = p.markerText;
    }
    return o;
  });

  const onSelectionChange = (e: { nativeEvent: ArticleTextViewSelection }) => {
    const { location, length } = e.nativeEvent;
    if (location < 0) {
      setSel('désélection');
      return;
    }
    const info = nativeSelectionToInfo(model, location, location + length);
    setSel(
      info
        ? `[${location},${location + length}) → « ${info.text} » (ordinal ${info.index}, ancre ${info.canonicalStart}..${info.canonicalEnd})`
        : `[${location},${location + length}) → synthétique`
    );
  };

  const width = screenWidth - 32;
  return (
    <>
      <ArticleTextView
        text={text}
        spans={spans}
        paragraphs={paragraphs}
        textColor={hexToArgb(theme.text)}
        fontSize={FONT_SIZE}
        lineHeight={LINE_HEIGHT}
        measureWidth={width}
        onSelectionChange={onSelectionChange}
        onContentHeight={(e) => setHeightDp(e.nativeEvent.height)}
        style={{ width, height: heightDp ?? 0 }}
      />
      <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Témoin — {text.length} chars · hauteur native : {heightDp ?? '…'} dp
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Paragraphes :{' '}
          {paragraphs
            .map((p) => p.kind + (p.listItem ? `[${p.markerText?.trim()}]` : ''))
            .join(' ')}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Sélection : {sel}
        </ThemedText>
      </View>
    </>
  );
}

export default function SpikeRoute() {
  return <ArticleSpike />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  scroll: { flex: 1 },
  body: { padding: 16, gap: 12 },
  statusCard: { borderRadius: 10, padding: 12, gap: 4 },
});
