// =====================================================================
// 🧪 spike-uitextview.tsx — Spike C2/4-b (tranches 3/4) : UITextView
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après la tranche) : rend l'« article
// témoin » partagé (demo-doc.ts) à travers le modèle C1 puis les helpers
// de peinture partagés (attributed.ts) dans la lib @bsky.app/
// react-native-uitextview. Les runs homogènes produits par
// buildPaintSpans sont LES MÊMES que ceux envoyés au moteur Android
// (parité par construction) — ils deviennent les Text imbriqués de la
// lib. Sélection native (loupe/poignées/menu), lecture live des offsets.
// =====================================================================

import { UITextView, type SelectionChangeEvent } from '@bsky.app/react-native-uitextview';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { buildArticleText } from '@/components/article/native/article-text';
import { buildPaintSpans, MARK_ARGB } from '@/components/article/native/attributed';
import { buildNativeMarks } from '@/components/article/native/marks';
import {
  DEMO_DOC,
  DEMO_PRIVATE_HIGHLIGHT,
  DEMO_PUBLIC_HIGHLIGHT,
} from '@/components/article/native/demo-doc';
import { nativeSelectionToInfo } from '@/components/article/native/selection';

/** ARGB int → "rgba(r, g, b, a)" pour les styles RN de la lib. */
function argbToRgba(argb: number): string {
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

const FONT_SIZE = 17;
const LINE_HEIGHT = 26;

function NativeArticleSpike() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Spike UITextView (4-b)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Article témoin — mêmes runs que le moteur Android (parité).
        </ThemedText>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <DocView />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Style d'un run pour les Text imbriqués de la lib. */
function spanStyle(s: {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  mono: boolean;
  link: boolean;
  bg: number | null;
}): object {
  return [
    styles.run,
    s.bold && styles.bold,
    s.italic && styles.italic,
    s.underline && styles.underline,
    s.link && styles.link,
    s.mono && styles.mono,
    s.bg != null ? { backgroundColor: argbToRgba(s.bg) } : null,
  ];
}

/** Rend le témoin partagé dans un UITextView avec sélection native. */
function DocView() {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [sel, setSel] = useState<string>('—');
  const [lines, setLines] = useState<string[] | null>(null);
  const [tvW, setTvW] = useState<string>('?');

  const model = buildArticleText(DEMO_DOC);
  const text = model.text;

  // Marques du témoin (officielles + public + private) → mêmes que Android.
  const coloredMarks = buildNativeMarks(model, {
    highlights: [DEMO_PUBLIC_HIGHLIGHT, DEMO_PRIVATE_HIGHLIGHT],
  }).map((m) => ({ startCp: m.startCp, endCp: m.endCp, color: MARK_ARGB[m.kind] ?? 0 }));
  const spans = buildPaintSpans(model, coloredMarks);

  const onSelectionChange = (e: SelectionChangeEvent) => {
    const { start, end } = e.nativeEvent;
    const info = nativeSelectionToInfo(model, start, end);
    setSel(
      info
        ? `[${start},${end}) → « ${info.text} » (ordinal ${info.index}, ancre ${info.canonicalStart}..${info.canonicalEnd})`
        : `[${start},${end}) → désélection / synthétique`
    );
  };

  return (
    <>
      <UITextView
        uiTextView
        selectable
        onSelectionChange={onSelectionChange}
        onTextLayout={(e) =>
          setLines(
            (e.nativeEvent.lines ?? []).map((l) => (typeof l === 'string' ? l : (l.text ?? '')))
          )
        }
        onLayout={(e) =>
          setTvW(
            `${Math.round(e.nativeEvent.layout.width)}×${Math.round(e.nativeEvent.layout.height)}`
          )
        }
        style={[
          styles.article,
          { color: theme.text, width: screenWidth - 32, maxWidth: screenWidth - 32 },
        ]}
      >
        {spans.map((s, i) => (
          <UITextView key={i} style={spanStyle(s)}>
            {text.slice(s.start, s.end)}
          </UITextView>
        ))}
      </UITextView>
      <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Témoin — {text.length} chars · Vue {tvW} · {spans.length} runs · Sélection : {sel}
        </ThemedText>
        {lines ? (
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            Lignes natives ({lines.length}) : {lines.map((l) => JSON.stringify(l)).join(' | ')}
          </ThemedText>
        ) : null}
      </View>
    </>
  );
}

export default function SpikeRoute() {
  return <NativeArticleSpike />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  scroll: { flex: 1 },
  body: { padding: 16, gap: 12 },
  article: { fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT },
  run: { fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  link: { textDecorationLine: 'underline', color: '#3B82F6' },
  mono: { fontFamily: 'Menlo' },
  statusCard: { borderRadius: 10, padding: 12, gap: 4 },
});
