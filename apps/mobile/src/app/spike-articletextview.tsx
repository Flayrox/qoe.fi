// =====================================================================
// 🧪 spike-articletextview.tsx — Spike 4-c (tranche 4) : rendu + surface
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après la tranche) : rend l'« article
// témoin » partagé (demo-doc.ts) à travers le modèle C1 puis les helpers
// de peinture partagés (attributed.ts) dans le module natif maison
// `ArticleTextView` :
//   - spans : runs homogènes (gras/italique/souligné/mono/lien + fond des
//     marques) — LES MÊMES que le rendu iOS (parité par construction) ;
//   - paragraphs : layout de bloc (h2, blockquote, code, listes) ;
//   - géométrie native : onSelectionChange transporte le centre de la 1re
//     ligne sélectionnée (y, dp) → l'adapter C1 produit le MÊME
//     `SelectionInfo` que le moteur tokens → la **vraie SelectionPopover**
//     (surface morphée, inchangée) s'ancre au bon endroit et ses actions
//     (Surligner/Citer/Annoter/Copier) vivent telles quelles.
// La barre ActionMode système est NEUTRALISÉE (menu vidé — les poignées
// restent natives) ; liens peints avec la couleur du thème (4-c).
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
import {
  nativeSelectionToInfo,
  nativeSelectionToPopoverInfo,
} from '@/components/article/native/selection';
import { SelectionPopover } from '@/components/article/selection-popover';
import type { SelectionInfo } from '@/components/article/html-blocks';

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
        <ThemedText type="subtitle">Spike ArticleTextView (4-c)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Article témoin — sélection native → surface morphée ancrée (pill + actions).
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
  const [selInfo, setSelInfo] = useState<SelectionInfo | null>(null);
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

  /** Sélection native → SelectionInfo (adapter C1) → vraie pill morphée.
   *  y vient du natif (centre de la 1re ligne) : même ancrage que le
   *  moteur tokens. location=-1 (désélection) → pill sortie animée. */
  const onSelectionChange = (e: { nativeEvent: ArticleTextViewSelection }) => {
    const { location, length, y } = e.nativeEvent;
    if (location < 0) {
      setSel('désélection');
      setSelInfo(null);
      return;
    }
    const info = nativeSelectionToInfo(model, location, location + length);
    setSel(
      info
        ? `[${location},${location + length}) → « ${info.text} » (ordinal ${info.index}, ancre ${info.canonicalStart}..${info.canonicalEnd}, y ${y?.toFixed(1) ?? '?'} dp)`
        : `[${location},${location + length}) → synthétique`
    );
    setSelInfo(nativeSelectionToPopoverInfo(model, location, location + length, y ?? 0));
  };

  const width = screenWidth - 32;
  return (
    <>
      {/* HUD compact (haut, jamais masqué) — état live pour les captures. */}
      <View style={[styles.hud, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          {sel}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Popover : {selInfo ? `ACTIVE « ${selInfo.text} » y=${selInfo.y.toFixed(1)}` : 'fermé (—)'}
        </ThemedText>
      </View>
      {/* Wrapper relatif : la pill est ancrée en `top` par la géométrie
          native (y = centre de la 1re ligne, dp, relatif à la vue texte).
          Un tap sur le texte désélectionne (natif) → pill sortie animée. */}
      <View style={styles.textWrap}>
        <ArticleTextView
          text={text}
          spans={spans}
          paragraphs={paragraphs}
          textColor={hexToArgb(theme.text)}
          linkColor={hexToArgb(theme.link)}
          fontSize={FONT_SIZE}
          lineHeight={LINE_HEIGHT}
          measureWidth={width}
          onSelectionChange={onSelectionChange}
          onContentHeight={(e) => setHeightDp(e.nativeEvent.height)}
          style={{ width, height: heightDp ?? 0 }}
        />
        {selInfo ? (
          <SelectionPopover
            selection={selInfo}
            articleId="demo-4c"
            onClose={() => setSelInfo(null)}
          />
        ) : null}
      </View>
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
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Popover : {selInfo ? `« ${selInfo.text} » (y ${selInfo.y.toFixed(1)})` : '—'}
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
  hud: { borderRadius: 8, padding: 8, gap: 2 },
  textWrap: { position: 'relative', width: '100%' },
  statusCard: { borderRadius: 10, padding: 12, gap: 4 },
});
