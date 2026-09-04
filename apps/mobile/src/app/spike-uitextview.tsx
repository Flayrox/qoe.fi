// =====================================================================
// 🧪 spike-uitextview.tsx — Spike C2 (tranche 3) : preuve UITextView
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après le spike) : rend un document
// canonique de démo à travers le modèle C1 (article-text.ts) avec la lib
// @bsky.app/react-native-uitextview — marques peintes, sélection native
// (loupe/poignées/onSelectionChange) et lecture live des offsets.
// Ligne d'état en bas : Start/End UTF-16 + passage canonique résolu par
// nativeSelectionToInfo — validation sans console externe.
// =====================================================================

import { UITextView, type SelectionChangeEvent } from '@bsky.app/react-native-uitextview';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { CanonicalDocument } from '@qoe/sdk/mobile';

import {
  buildArticleText,
  cpToUtf16,
  type ArticleTextModel,
} from '@/components/article/native/article-text';
import { buildNativeMarks, type NativeMark } from '@/components/article/native/marks';
import { nativeSelectionToInfo } from '@/components/article/native/selection';

// ── Fixture « réaliste » (2 paragraphes + gras + lien + span officiel) ─
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

// ── Fixture 1B : UN SEUL paragraphe (pas de \n dans le texte plat) ─
const oneBlockDoc: CanonicalDocument = {
  sha: 'demo-2',
  text: 'Le chat mange la souris. Le chat dort.',
  blocks: [
    {
      kind: 'p',
      text: 'Le chat mange la souris. Le chat dort.',
      inline: [
        { start: 3, end: 7, style: 'bold' },
        { start: 8, end: 13, style: 'italic' },
        { start: 14, end: 23, style: 'underline' },
      ],
      spans: [
        { start: 0, end: 2, note: 'Note officielle' },
        { start: 25, end: 32, note: 'Note officielle 2' },
      ],
    },
  ],
  segments: [
    { blockIdx: 0, itemIdx: 0, text: 'Le chat mange la souris. Le chat dort.', start: 0, end: 38 },
  ],
};

// ── Couleurs des marques (provisoires pour le spike) ─
const MARK_COLORS: Record<NativeMark['kind'], string> = {
  official: 'rgba(250, 204, 21, 0.45)', // ambre — officiel du créateur
  public: 'rgba(59, 130, 246, 0.30)', // bleu — public
  private: 'rgba(245, 158, 11, 0.25)', // ambre doux — privé
  spotlight: 'rgba(16, 185, 129, 0.40)', // émeraude — deep-link
};

/** Style d'un run pour les Text imbriqués de la lib. */
function runStyle(s: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  backgroundColor?: string;
}): object {
  return [
    styles.run,
    s.bold && styles.bold,
    s.italic && styles.italic,
    s.underline && styles.underline,
    s.backgroundColor ? { backgroundColor: s.backgroundColor } : null,
  ];
}

/** Regroupe le texte plat en sous-runs homogènes (styles inline + marques). */
function renderSegments(model: ArticleTextModel): {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  backgroundColor?: string;
}[] {
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
  });
  const n = model.text.length;

  // Attribut par code point (styles inline + fond de marque).
  type Attr = { bold: boolean; italic: boolean; underline: boolean; bg: string | null };
  const attrs: Attr[] = Array.from({ length: n }, () => ({
    bold: false,
    italic: false,
    underline: false,
    bg: null,
  }));
  for (const r of model.runs) {
    for (let cp = r.startCp; cp < r.endCp && cp < n; cp++) {
      if (r.style === 'bold') attrs[cp].bold = true;
      if (r.style === 'italic') attrs[cp].italic = true;
      if (r.style === 'underline') attrs[cp].underline = true;
    }
  }
  for (const m of marks) {
    const bg = MARK_COLORS[m.kind];
    for (let cp = m.startCp; cp < m.endCp && cp < n; cp++) attrs[cp].bg = bg;
  }

  const out: ReturnType<typeof renderSegments> = [];
  for (let cp = 0; cp < n;) {
    const a = attrs[cp];
    let j = cp + 1;
    while (
      j < n &&
      attrs[j].bold === a.bold &&
      attrs[j].italic === a.italic &&
      attrs[j].underline === a.underline &&
      attrs[j].bg === a.bg
    )
      j++;
    out.push({
      text: model.text.slice(cpToUtf16(model.text, cp), cpToUtf16(model.text, j)),
      bold: a.bold,
      italic: a.italic,
      underline: a.underline,
      backgroundColor: a.bg ?? undefined,
    });
    cp = j;
  }
  return out;
}

function NativeArticleSpike() {
  const theme = useTheme();

  const model = buildArticleText(demoDoc);
  const segments = renderSegments(model);

  const segTexts = segments.map((s) => s.text);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Spike UITextView (C2)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Appui long puis glissez pour sélectionner — vérifiez loupe/poignées.
        </ThemedText>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <ThemedText type="small" style={{ color: theme.text, fontWeight: '700' }}>
          A — 2 blocs (\n dans un fragment « is.\n ») :
        </ThemedText>
        <DocView doc={demoDoc} label="A" />
        <ThemedText type="small" style={{ color: theme.text, fontWeight: '700' }}>
          B — 1 bloc (pas de \n) :
        </ThemedText>
        <DocView doc={oneBlockDoc} label="B" />
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            Texte plat A (JSON) :{'\n'}
            {JSON.stringify(model.text)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            Segments rendus A ({segments.length}) :{'\n'}
            {segTexts.map((t) => JSON.stringify(t)).join(' ')}
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rend un document canonique dans un UITextView avec sélection native. */
function DocView({ doc, label }: { doc: CanonicalDocument; label: string }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [sel, setSel] = useState<string>('—');
  const [lines, setLines] = useState<string[] | null>(null);
  const [tvW, setTvW] = useState<string>('?');

  const model = buildArticleText(doc);
  const segments = renderSegments(model);

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
        {segments.map((s, i) => (
          <UITextView key={i} style={runStyle(s)}>
            {s.text}
          </UITextView>
        ))}
      </UITextView>
      <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          {label} — Vue {tvW} · Sélection : {sel}
        </ThemedText>
        {lines ? (
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            {label} — Lignes natives ({lines.length}) :{' '}
            {lines.map((l) => JSON.stringify(l)).join(' | ')}
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
  article: { fontSize: 17, lineHeight: 26 },
  run: { fontSize: 17, lineHeight: 26 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  statusCard: { borderRadius: 10, padding: 12 },
});
