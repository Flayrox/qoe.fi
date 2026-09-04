// =====================================================================
// 🧪 spike-articletextview.tsx — Spike 4-d (tranche 4) : spotlight
// =====================================================================
// Écran DEV TEMPORAIRE (à supprimer après la tranche) : rend l'« article
// témoin » partagé (demo-doc.ts) à travers le modèle C1 puis les helpers
// de peinture partagés (attributed.ts) dans le module natif maison
// `ArticleTextView` :
//   - spans : runs homogènes (gras/italique/souligné/mono/lien + fond des
//     marques) — LES MÊMES que le rendu iOS (parité par construction) ;
//   - paragraphs : layout de bloc (h2, blockquote, code, listes) ;
//   - géométrie native : onSelectionChange transporte le centre de la 1re
//     ligne sélectionnée (y, dp) → la **vraie SelectionPopover** (surface
//     morphée, inchangée) s'ancre au bon endroit (4-c) ;
//   - 🔦 spotlight (4-d) : la marque spotlight (émeraude, poussée en
//     dernier par buildNativeMarks → prioritaire) est peinte comme les
//     autres ; la prop `spotlightStart` fait MESURER nativement la
//     position window de la 1re ligne du passage → onSpotlightMeasured →
//     la ScrollView scrolle dessus (même formule que article-screen).
// La barre ActionMode système est NEUTRALISÉE (menu vidé — les poignées
// restent natives) ; liens peints avec la couleur du thème (4-c).
// =====================================================================

import { useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ArticleTextView,
  type ArticleTextViewParagraph,
  type ArticleTextViewSelection,
  type ArticleTextViewSpotlightMeasured,
} from '../../modules/article-text-view/src';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { buildArticleText, cpToUtf16 } from '@/components/article/native/article-text';
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
  DEMO_SPOTLIGHT,
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
/** Marge de scroll : le passage arrive SOUS le HUD (comme le header
 *  flottant de l'écran article — CONTENT_TOP_PADDING du legacy). */
const SCROLL_MARGIN_DP = 120;

function ArticleSpike() {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollYRef = useRef(0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Spike ArticleTextView (4-d)</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Article témoin — sélection native → surface morphée + 🔦 spotlight deep-link (mesure
          native → scroll).
        </ThemedText>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} style={styles.body}>
          <DocView scrollRef={scrollRef} contentRef={contentRef} scrollYRef={scrollYRef} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rendu du témoin partagé dans l'ArticleTextView natif. */
function DocView({
  scrollRef,
  contentRef,
  scrollYRef,
}: {
  scrollRef: RefObject<ScrollView | null>;
  contentRef: RefObject<View | null>;
  scrollYRef: MutableRefObject<number>;
}) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [sel, setSel] = useState<string>('—');
  const [selInfo, setSelInfo] = useState<SelectionInfo | null>(null);
  const [heightDp, setHeightDp] = useState<number | null>(null);
  // 🔦 Spotlight (4-d) : activé par le bouton du HUD — peinture (marque
  // émeraude) + mesure native → scroll au passage.
  const [spotlightOn, setSpotlightOn] = useState(false);
  const [spotY, setSpotY] = useState<number | null>(null);
  const scrolledSpotlightRef = useRef(false);

  const model = buildArticleText(DEMO_DOC);
  const text = model.text;

  // Marques du témoin (officielles + public + private [+ spotlight]) → ARGB.
  // buildNativeMarks pousse le spotlight en DERNIER : en cas de
  // chevauchement, la dernière marque couvre (doc. buildPaintSpans).
  const nativeMarks = buildNativeMarks(model, {
    highlights: [DEMO_PUBLIC_HIGHLIGHT, DEMO_PRIVATE_HIGHLIGHT],
    spotlight: spotlightOn
      ? {
          start: DEMO_SPOTLIGHT.canonicalStart,
          end: DEMO_SPOTLIGHT.canonicalEnd,
          sha: DEMO_DOC.sha,
        }
      : null,
  });
  const coloredMarks = nativeMarks.map((m) => ({
    startCp: m.startCp,
    endCp: m.endCp,
    color: MARK_ARGB[m.kind] ?? 0,
  }));

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

  // Début du spotlight en UTF-16 du texte AFFICHÉ (la marque spotlight
  // résolue par buildNativeMarks a déjà converti le canonique → display).
  const spotlightMark = nativeMarks.find((m) => m.kind === 'spotlight');
  const spotlightStartUtf16 = spotlightMark ? cpToUtf16(model.text, spotlightMark.startCp) : -1;

  /** Sélection native → SelectionInfo (adapter C1) → vraie pill morphée. */
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

  /** 🔦 La mesure native du spotlight est arrivée → scroll au passage
   *  (une seule fois par activation — l'utilisateur lit ensuite). */
  const onSpotlightMeasured = (e: { nativeEvent: ArticleTextViewSpotlightMeasured }) => {
    const { y } = e.nativeEvent;
    setSpotY(y);
    if (scrolledSpotlightRef.current) return;
    scrolledSpotlightRef.current = true;
    const node = contentRef.current;
    const sv = scrollRef.current;
    if (!node || !sv) return;
    node.measureInWindow((_x, contentWindowY) => {
      // Même conversion que article-screen : position du passage dans le
      // contenu scrollable = (yWindow − yWindow(contenu)) + offset courant.
      const yInContent = y - contentWindowY + scrollYRef.current;
      sv.scrollTo({ y: Math.max(0, yInContent - SCROLL_MARGIN_DP), animated: true });
    });
  };

  const toggleSpotlight = () => {
    if (spotlightOn) {
      // Reset : retire la marque + réarme le scroll (un prochain passage
      // peut être re-déclenché).
      scrolledSpotlightRef.current = false;
      setSpotY(null);
    }
    setSpotlightOn(!spotlightOn);
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
        <View style={styles.hudRow}>
          <Pressable
            onPress={toggleSpotlight}
            style={({ pressed }) => [
              styles.hudBtn,
              spotlightOn && { backgroundColor: '#10b981' },
              pressed && styles.hudBtnPressed,
            ]}
          >
            <ThemedText type="small" style={{ color: spotlightOn ? '#fff' : theme.text }}>
              {spotlightOn ? '✕ reset spotlight' : '⚡ spotlight'}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
            {spotlightOn
              ? `P5 y=${spotY?.toFixed(1) ?? '…'} dp ${scrolledSpotlightRef.current ? '(scrollé)' : '(mesure…)'}`
              : 'spotlight : inactif'}
          </ThemedText>
        </View>
      </View>
      {/* Wrapper relatif : la pill est ancrée en `top` par la géométrie
          native (y = centre de la 1re ligne, dp, relatif à la vue texte). */}
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
          spotlightStart={spotlightStartUtf16}
          onSelectionChange={onSelectionChange}
          onContentHeight={(e) => setHeightDp(e.nativeEvent.height)}
          onSpotlightMeasured={onSpotlightMeasured}
          style={{ width, height: heightDp ?? 0 }}
        />
        {selInfo ? (
          <SelectionPopover
            selection={selInfo}
            articleId="demo-4d"
            onClose={() => setSelInfo(null)}
          />
        ) : null}
      </View>
      <View style={[styles.statusCard, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={{ color: theme.text, fontFamily: 'monospace' }}>
          Témoin — {text.length} chars · hauteur native : {heightDp ?? '…'} dp · spotlight UTF-16 :{' '}
          {spotlightStartUtf16}
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
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  hudBtn: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hudBtnPressed: { opacity: 0.6 },
  textWrap: { position: 'relative', width: '100%' },
  statusCard: { borderRadius: 10, padding: 12, gap: 4 },
});
