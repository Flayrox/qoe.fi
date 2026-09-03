import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { playHaptic } from '@/lib/haptics';

import {
  absoluteTokenRect,
  buildBlockIndex,
  computeHighlightTokenSets,
  htmlToBlocks,
  mergeRectsToBands,
  selectionToInfo,
  type Block,
  type Rect,
  type RectsBundle,
  type SegmentInfo,
  type SelectionInfo,
} from './html-blocks-core';

export type { SelectionInfo };

// =====================================================================
// 📄 html-blocks.tsx — Rendu + sélection mot-à-mot de l'article (mobile)
// =====================================================================
// Couche « vue » du moteur (logique pure dans html-blocks-core.ts) :
//   - Le contenu est rendu en TOKENS (mots) mesurables individuellement
//     (onLayout) — même typographie que le rendu mono-Text, donc même
//     mise en page ; chaque <li> est son propre flux.
//   - Gesture.Pan activé après appui long (~340 ms, tolérant au bougé :
//     activateAfterLongPress) : sélection d'un mot puis extension par
//     glissement sur tout l'article. Le surlignage live est peint en
//     OVERLAY (les tokens ne re-rendent jamais pendant le geste).
//   - Au relâchement : onSelect(SelectionInfo) → popover web-like
//     (Surligner / Citer / Annoter / Copier). La sélection reste peinte
//     tant que le popover est ouvert (prop `selection`).
//   - Les surlignages persistés (`highlights`) sont rendus INLINE dans le
//     texte (équivalent du <mark> web) via computeHighlightTokenSets.
// ⚠️ Sécurité : aucune exécution — on ne rend que des Text/Image React
//    Native, jamais de HTML brut (équivalent natif de sanitizeHtml).
// =====================================================================

const HIGHLIGHT_ALPHA = '33'; // surlignages persistés (inline <mark>)
const SELECTION_ALPHA = '5C'; // sélection live / popover ouvert
const HIT_SLOP = 40 * 40; // repli « token le plus proche » (rayon 40 px)

interface KindStyles {
  wrap?: ViewStyle;
  tokenExtra?: TextStyle;
  textType?: ThemedTextProps['type'];
}

function kindStylesFor(block: Block, theme: { textSecondary: string }): KindStyles {
  switch (block.type) {
    case 'h1':
      return { wrap: { marginTop: Spacing.two }, tokenExtra: styles.h1 };
    case 'h2':
      return { wrap: { marginTop: Spacing.two }, tokenExtra: styles.h2 };
    case 'h3':
      return { wrap: { marginTop: Spacing.two }, tokenExtra: styles.h3 };
    case 'h4':
      return { wrap: { marginTop: Spacing.two }, tokenExtra: styles.h4 };
    case 'blockquote':
      return {
        wrap: styles.quote,
        tokenExtra: { ...styles.quoteText, color: theme.textSecondary },
      };
    case 'code':
      return { wrap: styles.codeBlock, tokenExtra: styles.codeText, textType: 'code' };
    default:
      return { tokenExtra: styles.paragraph };
  }
}

function blockIsList(block: Block): block is { type: 'ul' | 'ol'; items: string[] } {
  return block.type === 'ul' || block.type === 'ol';
}

export interface ArticleHtmlProps {
  html: string;
  /**
   * Surlignages (publics + les miens) à rendre inline dans le texte —
   * mêmes entrées que GET /v1/articles/{id}/highlights.
   */
  highlights?: ({ text?: string | null; quoteOrdinal?: number } | null | undefined)[];
  /** Sélection en cours (popover ouvert) — maintient le surlignage live. */
  selection?: SelectionInfo | null;
  /** Relâchement d'une sélection → le passage choisi (texte brut + ordinal).
   *  `null` = tap en dehors de la sélection → fermer le popover. */
  onSelect?: (info: SelectionInfo | null) => void;
  /** Verrouille le scroll de la ScrollView pendant le geste de sélection. */
  onScrollLock?: (locked: boolean) => void;
}

export function ArticleHtml({
  html,
  highlights = [],
  selection = null,
  onSelect,
  onScrollLock,
}: ArticleHtmlProps) {
  const theme = useTheme();
  const blocks = useMemo(() => htmlToBlocks(html), [html]);
  const index = useMemo(() => buildBlockIndex(blocks), [blocks]);
  const highlightedTokens = useMemo(
    () => computeHighlightTokenSets(index, highlights),
    [index, highlights]
  );

  const blockRects = useRef(new Map<number, Rect>());
  const rowRects = useRef(new Map<string, Rect>());
  const flowRects = useRef(new Map<string, Rect>());
  const tokenRects = useRef(new Map<string, Rect>());

  const hcColor = theme.primary + HIGHLIGHT_ALPHA;
  const selColor = theme.primary + SELECTION_ALPHA;

  // Sélection live pendant le geste (peinture overlay, aucun re-render des tokens).
  const [liveSel, setLiveSel] = useState<{ a: string; b: string } | null>(null);
  const activeRef = useRef(false);
  const liveRef = useRef<{ a: string; b: string } | null>(null);

  const setBlock = (b: number) => (e: LayoutChangeEvent) => {
    blockRects.current.set(b, e.nativeEvent.layout);
  };
  const setRow = (key: string) => (e: LayoutChangeEvent) => {
    rowRects.current.set(key, e.nativeEvent.layout);
  };
  const setFlow = (key: string) => (e: LayoutChangeEvent) => {
    flowRects.current.set(key, e.nativeEvent.layout);
  };
  const setToken = (id: string) => (e: LayoutChangeEvent) => {
    tokenRects.current.set(id, e.nativeEvent.layout);
  };

  const bundles = (): RectsBundle => ({
    blockRects: blockRects.current,
    rowRects: rowRects.current,
    flowRects: flowRects.current,
    tokenRects: tokenRects.current,
  });

  // Rects ABSOLUS (conteneur d'article) des tokens, recalculés une fois par
  // geste. ⚠️ Les rects mesurés par onLayout sont RELATIFS à leur flux — les
  // comparer directement aux coordonnées du doigt ne marche que sur le tout
  // premier paragraphe (d'où une sélection « qui ne marche pas » partout
  // ailleurs). On projette donc chaque token en coordonnées du conteneur.
  const absRects = useRef<{ id: string; r: Rect }[] | null>(null);
  const ensureAbsRects = (): { id: string; r: Rect }[] => {
    if (!absRects.current) {
      const out: { id: string; r: Rect }[] = [];
      for (const id of tokenRects.current.keys()) {
        const r = absoluteTokenRect(bundles(), id);
        if (r) out.push({ id, r });
      }
      absRects.current = out;
    }
    return absRects.current;
  };

  /**
   * Token sous le doigt, en coordonnées du conteneur. Repli : le token le
   * plus proche à ≤ 40 px (sélection tolérante dans les inter-paragraphes,
   * les marges et entre les lignes).
   */
  const hitTest = (x: number, y: number): string | null => {
    let best: { id: string; d: number } | null = null;
    for (const { id, r } of ensureAbsRects()) {
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        return id;
      }
      const dx = x < r.x ? r.x - x : x > r.x + r.width ? x - (r.x + r.width) : 0;
      const dy = y < r.y ? r.y - y : y > r.y + r.height ? y - (r.y + r.height) : 0;
      const d = dx * dx + dy * dy;
      if (d <= HIT_SLOP && (!best || d < best.d)) best = { id, d };
    }
    return best ? best.id : null;
  };

  // Les handlers vivent dans une ref (réassignée à chaque render) : ils
  // ferment sur l'index/layout COURANTS sans recréer la gesture.
  const handlers = useRef({
    begin(_x: number, _y: number) {},
    extend(_x: number, _y: number) {},
    finish() {},
    dismiss() {},
  });
  handlers.current.begin = (x, y) => {
    const id = hitTest(x, y);
    if (!id) return;
    activeRef.current = true;
    liveRef.current = { a: id, b: id };
    setLiveSel({ a: id, b: id });
    onScrollLock?.(true);
    playHaptic('Light');
  };
  handlers.current.extend = (x, y) => {
    if (!activeRef.current) return;
    const id = hitTest(x, y);
    if (!id) return;
    liveRef.current = { a: liveRef.current!.a, b: id };
    setLiveSel({ a: liveRef.current!.a, b: id });
  };
  handlers.current.finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    onScrollLock?.(false);
    const sel = liveRef.current;
    liveRef.current = null;
    absRects.current = null; // prochain geste : re-mesure fraîche
    setLiveSel(null);
    if (!sel) return;
    const info = selectionToInfo(index, sel.a, sel.b, bundles());
    if (info) onSelect?.(info);
  };

  // Tap en dehors de la sélection → ferme le popover (onSelect(null)).
  // Uniquement actif quand une sélection est affichée ; l'appui long qui
  // lance une nouvelle sélection n'est jamais intercepté (maxDuration court).
  handlers.current.dismiss = () => {
    if (selection && !activeRef.current) onSelect?.(null);
  };

  // ⚠️ Les callbacks de Gesture.Pan tournent sur le runtime UI (worklets
  // RNGH + Reanimated) : on ne peut PAS y appeler des fonctions JS du
  // thread React directement — « Tried to synchronously call a Remote
  // Function ». Chaque entrée rebondit via runOnJS vers un wrapper qui lit
  // `handlers.current` AU MOMENT de l'appel (jamais de closure périmée).
  const gesture = useMemo(() => {
    const beginJS = (x: number, y: number) => handlers.current.begin(x, y);
    const extendJS = (x: number, y: number) => handlers.current.extend(x, y);
    const finishJS = () => handlers.current.finish();
    const dismissJS = () => handlers.current.dismiss();
    const pan = Gesture.Pan()
      .activateAfterLongPress(340)
      .shouldCancelWhenOutside(false)
      .onStart((e) => runOnJS(beginJS)(e.x, e.y))
      .onUpdate((e) => runOnJS(extendJS)(e.x, e.y))
      .onEnd(() => runOnJS(finishJS)())
      .onFinalize(() => runOnJS(finishJS)());
    if (!selection) return pan;
    // Race : le tap court (≤ 250 ms) gagne → on ferme le popover ; l'appui
    // long (> 250 ms) fait échouer le tap → la sélection peut recommencer.
    const tap = Gesture.Tap()
      .maxDuration(250)
      .maxDistance(20)
      .onEnd((_e, success) => {
        'worklet';
        if (success) runOnJS(dismissJS)();
      });
    return Gesture.Race(pan, tap);
  }, [selection]);

  // Rendu des blocs — mémoïsé : la peinture live ne re-rend que l'overlay.
  const blocksUi = useMemo(() => {
    const byBlock = new Map<number, SegmentInfo[]>();
    for (const segment of index) {
      const list = byBlock.get(segment.blockIdx) ?? [];
      list.push(segment);
      byBlock.set(segment.blockIdx, list);
    }
    return blocks.map((block, b) => {
      const segments = byBlock.get(b);
      if (!segments?.length) {
        return block.type === 'img' || block.type === 'hr' ? (
          <BlockView key={b} block={block} />
        ) : null;
      }
      const list = blockIsList(block);
      const kind = kindStylesFor(block, theme);
      return (
        <View
          key={b}
          accessible
          accessibilityRole="text"
          accessibilityLabel={segments.map((s) => s.display).join(' ')}
          style={[kind.wrap, list && styles.list]}
          onLayout={setBlock(b)}
        >
          {list
            ? segments.map((segment) => (
                <View
                  key={segment.flowId}
                  style={styles.listItem}
                  onLayout={setRow(segment.flowId)}
                >
                  <ThemedText style={[styles.bullet, { color: theme.textSecondary }]}>
                    {block.type === 'ol' ? `${segment.itemIdx + 1}.` : '•'}
                  </ThemedText>
                  <TokenFlow
                    segment={segment}
                    kind={kind}
                    listItem
                    highlighted={highlightedTokens}
                    hcColor={hcColor}
                    onLayoutFlow={setFlow(segment.flowId)}
                    onLayoutToken={setToken}
                  />
                </View>
              ))
            : segments.map((segment) => (
                <TokenFlow
                  key={segment.flowId}
                  segment={segment}
                  kind={kind}
                  highlighted={highlightedTokens}
                  hcColor={hcColor}
                  onLayoutFlow={setFlow(segment.flowId)}
                  onLayoutToken={setToken}
                />
              ))}
        </View>
      );
    });
  }, [blocks, index, highlightedTokens, hcColor, theme]);

  // Overlay de sélection — BANDES CONTINUES par ligne (comme la sélection
  // native : un seul bloc entre les deux bornes, pas des « pastilles » mot
  // par mot). pointerEvents none : ne bloque ni le scroll ni les gestes.
  const overlayBands = useMemo(() => {
    const paintRange = liveSel ?? (selection ? { a: selection.from, b: selection.to } : null);
    if (!paintRange) return [];
    const rects = bundles();
    const chips: Rect[] = [];
    for (const segment of index) {
      for (const t of segment.tokens) {
        if (!isBetween(t, paintRange.a, paintRange.b)) continue;
        const r = absoluteTokenRect(rects, t.id);
        if (r) chips.push(r);
      }
    }
    return mergeRectsToBands(chips);
  }, [liveSel, selection, index]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        {blocksUi}
        {overlayBands.length > 0 ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {overlayBands.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.selectionChip,
                  {
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    height: r.height,
                    backgroundColor: selColor,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

/** `t` est-il entre les tokens `a` et `b` (bornes incluses, ordre document) ? */
function isBetween(t: SegmentInfo['tokens'][number], aId: string, bId: string): boolean {
  const p = [t.blockIdx, t.itemIdx, t.tokIdx];
  const pa = aId.split(':').map(Number);
  const pb = bId.split(':').map(Number);
  const lo =
    pa[0] < pb[0] ||
    (pa[0] === pb[0] && pa[1] < pb[1]) ||
    (pa[0] === pb[0] && pa[1] === pb[1] && pa[2] <= pb[2])
      ? pa
      : pb;
  const hi = lo === pa ? pb : pa;
  const atOrAfterLo =
    p[0] > lo[0] ||
    (p[0] === lo[0] && p[1] > lo[1]) ||
    (p[0] === lo[0] && p[1] === lo[1] && p[2] >= lo[2]);
  const atOrBeforeHi =
    p[0] < hi[0] ||
    (p[0] === hi[0] && p[1] < hi[1]) ||
    (p[0] === hi[0] && p[1] === hi[1] && p[2] <= hi[2]);
  return atOrAfterLo && atOrBeforeHi;
}

function TokenFlow({
  segment,
  kind,
  listItem,
  highlighted,
  hcColor,
  onLayoutFlow,
  onLayoutToken,
}: {
  segment: SegmentInfo;
  kind: KindStyles;
  listItem?: boolean;
  highlighted: Set<string>;
  hcColor: string;
  onLayoutFlow: (e: LayoutChangeEvent) => void;
  onLayoutToken: (id: string) => (e: LayoutChangeEvent) => void;
}) {
  const type = kind.textType ?? 'default';
  return (
    <View style={[styles.tokenFlow, listItem && styles.tokenFlowItem]} onLayout={onLayoutFlow}>
      {segment.tokens.map((t, i) => (
        // Cluster mot + espace : on mesure le MOT exactement, l'espace suit
        // (une coupure de ligne emporte le mot avec son espace, comme le
        // texte natif consomme l'espace en fin de ligne).
        <View key={t.id} style={styles.tokenCluster} onLayout={onLayoutToken(t.id)}>
          <ThemedText
            type={type}
            style={[kind.tokenExtra, highlighted.has(t.id) && { backgroundColor: hcColor }]}
          >
            {t.text}
          </ThemedText>
          {i < segment.tokens.length - 1 ? (
            <ThemedText type={type} style={kind.tokenExtra} accessible={false}>
              {' '}
            </ThemedText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  const theme = useTheme();
  switch (block.type) {
    case 'img':
      return (
        <Image
          source={{ uri: block.src }}
          style={[styles.image, { backgroundColor: theme.backgroundSelected }]}
          contentFit="cover"
          transition={200}
          accessibilityLabel={block.alt}
        />
      );
    case 'hr':
      return <View style={[styles.hr, { backgroundColor: theme.border }]} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  /** Flux de mots (flexWrap) — mêmes métriques que le texte mono-Text. */
  tokenFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    flexShrink: 1,
  },
  tokenFlowItem: {
    flex: 1,
  },
  /** Cluster mot + espace : géométrie du mot mesurée indépendamment. */
  tokenCluster: {
    flexDirection: 'row',
  },
  selectionChip: {
    position: 'absolute',
    borderRadius: 4,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
  h1: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  h3: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
  },
  h4: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
  },
  quoteText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  list: {
    gap: Spacing.one,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    width: 20,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  codeBlock: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  codeText: {
    lineHeight: 18,
  },
});

// Ré-export de compatibilité (tests + appels existants).
export { blockText } from './html-blocks-core';
