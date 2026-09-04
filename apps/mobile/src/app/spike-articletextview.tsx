// =====================================================================
// 🧪 spike-articletextview.tsx — Spike 4-a (tranche 4) : preuve Android
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après le spike) : rend le même document
// canonique de démo que le spike iOS (C2) à travers le modèle C1, mais dans
// le module natif maison `ArticleTextView` (TextView + Spannable, sélection
// native Android).
// La hauteur du texte est mesurée par un <Text> RN « jumeau » invisible
// (même typo/largeur) : RN mesure le texte nativement, on donne le résultat
// à la vue native — ainsi le contenu n'est ni tronqué ni scrollable en
// interne. Ligne d'état en bas : location/length UTF-16 + passage canonique
// résolu par nativeSelectionToInfo.
// =====================================================================

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ArticleTextView,
  type ArticleTextViewRun,
  type ArticleTextViewSelection,
} from '../../modules/article-text-view/src';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { CanonicalDocument } from '@qoe/sdk/mobile';

import { buildArticleText, cpToUtf16 } from '@/components/article/native/article-text';
import { buildNativeMarks, type NativeMark } from '@/components/article/native/marks';
import { nativeSelectionToInfo } from '@/components/article/native/selection';

// ── Mêmes fixtures que le spike iOS C2 (parité de démo) ─────────────────
const demoDoc: CanonicalDocument = {
  sha: 'demo-1',
  text: 'Le chat mange la souris. Le chat dort.',
  blocks: [
    {
      kind: 'p',
      text: 'Le chat mange la souris.',
      inline: [
        { start: 3, end: 7, style: 'bold' },
        { start: 8, end: 13, style: 'italic' },
        { start: 14, end: 23, style: 'underline' },
      ],
      spans: [{ start: 0, end: 2, note: 'Note officielle' }],
    },
    { kind: 'p', text: 'Le chat dort.' },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Le chat mange la souris.', start: 0, end: 24 },
    { blockIdx: 1, itemIdx: 0, text: 'Le chat dort.', start: 25, end: 38 },
  ],
};

// ── Couleurs des marques — mêmes sémantiques que le spike iOS ───────────
const MARK_COLORS: Record<NativeMark['kind'], string> = {
  official: 'rgba(250, 204, 21, 0.45)',
  public: 'rgba(59, 130, 246, 0.30)',
  private: 'rgba(245, 158, 11, 0.25)',
  spotlight: 'rgba(16, 185, 129, 0.40)',
};

/** rgba("r, g, b, a") → ARGB int. */
function rgbaToArgb(rgba: string): number {
  const m = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m) return 0xff000000;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = Math.round((m[4] === undefined ? 1 : Number(m[4])) * 255);
  return ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** "#rrggbb" → ARGB int (alpha plein). */
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
        <ThemedText type="subtitle">Spike ArticleTextView (4-a)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Appui long puis glissez pour sélectionner — poignées natives Android.
        </ThemedText>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <ThemedText type="small" style={{ color: theme.text, fontWeight: '700' }}>
          A — 2 blocs (\\n dans le texte plat) :
        </ThemedText>
        <DocView doc={demoDoc} label="A" />
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            Texte plat A (JSON) :{'\n'}
            {JSON.stringify(buildArticleText(demoDoc).text)}
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rendu d'un document canonique dans l'ArticleTextView natif. */
function DocView({ doc, label }: { doc: CanonicalDocument; label: string }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [sel, setSel] = useState<string>('—');
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  const [viewSize, setViewSize] = useState<string>('?');

  const model = buildArticleText(doc);
  const text = model.text;

  // Runs + marques en offsets UTF-16 (unités Java du Spannable).
  const runs = model.runs
    .filter((r) => r.style !== 'link' && r.style !== 'bullet' && r.style !== 'number')
    .map((r) => ({
      start: cpToUtf16(text, r.startCp),
      end: cpToUtf16(text, r.endCp),
      style: r.style as ArticleTextViewRun['style'],
    }));
  const marks = buildNativeMarks(model, {
    highlights: [
      { text: 'Le chat', canonicalStart: 3, canonicalEnd: 7, isPublic: true, contentSha: 'demo-1' },
      {
        text: 'Le chat',
        canonicalStart: 25,
        canonicalEnd: 32,
        isOfficial: true,
        contentSha: 'demo-1',
      },
    ],
  }).map((m) => ({
    start: cpToUtf16(text, m.startCp),
    end: cpToUtf16(text, m.endCp),
    color: rgbaToArgb(MARK_COLORS[m.kind]),
  }));

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
      {/* Jumeau invisible : RN mesure le texte (même typo/largeur) → hauteur native. */}
      <Text
        style={{
          position: 'absolute',
          left: -9999,
          top: 0,
          width,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: 'transparent',
        }}
        onLayout={(e) => setMeasuredH(Math.ceil(e.nativeEvent.layout.height))}
      >
        {text}
      </Text>
      <ArticleTextView
        text={text}
        runs={runs}
        marks={marks}
        textColor={hexToArgb(theme.text)}
        fontSize={FONT_SIZE}
        lineHeight={LINE_HEIGHT}
        onSelectionChange={onSelectionChange}
        onLayout={(e) =>
          setViewSize(
            `${Math.round(e.nativeEvent.layout.width)}×${Math.round(e.nativeEvent.layout.height)}`
          )
        }
        style={{ width, height: measuredH ?? 0 }}
      />
      <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          {label} — Vue {viewSize} (mesuré : {measuredH ?? '…'}) · Sélection : {sel}
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
  statusCard: { borderRadius: 10, padding: 12 },
});
