// =====================================================================
// 🍏 SelectionPopover — Barre d'actions style Apple (Callout Menu)
// =====================================================================
// Rendu haute fidélité inspiré du callout menu natif d'Apple :
//   - Pill unifiée en verre sombre dépoli avec bordure ultra-fine ;
//   - Typographie système épurée SF Pro (zéro emoji) ;
//   - Séparateurs verticaux fins entre les segments ;
//   - Pointe directionnelle (caret) pointant vers la sélection ;
//   - Basculement intelligent : au-dessus de la ligne (défaut) ou
//     en-dessous si la sélection est trop proche du haut (< 75px) ;
//   - Actions : Surligner · Citer · Annoter · Copier ;
//   - Morphing fluide en GlassComposer lors de « Citer » ou « Annoter ».
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { GlassComposer } from '@/components/composer/glass-composer';
import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { playHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';
import type { SelectionInfo } from '@/components/article/html-blocks';

type PopoverMode = 'toolbar' | 'quote' | 'note';

const POPOVER_HEIGHT = 38;
const CARET_HEIGHT = 6;
const LINE_HEIGHT = 26;

export function SelectionPopover({
  selection,
  articleId,
  onClose,
}: {
  selection: SelectionInfo;
  articleId: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(() => Math.max(0, windowWidth - 32));
  const [mode, setMode] = useState<PopoverMode>('toolbar');
  const [busy, setBusy] = useState(false);

  // Flip intelligent style Apple : si le texte sélectionné est tout en haut
  // (ligne 0, < 40px), on place le menu en-dessous de la ligne avec pointe vers
  // le haut pour ne pas empiéter sur l'en-tête de l'article.
  const isAbove = selection.y >= 40;
  const toolbarTop = isAbove
    ? Math.max(8, Math.round(selection.y - LINE_HEIGHT / 2 - POPOVER_HEIGHT - CARET_HEIGHT - 6))
    : Math.max(8, Math.round(selection.y + LINE_HEIGHT / 2 + 6));

  const composerTop =
    selection.y >= 180
      ? Math.max(8, Math.round(selection.y - 170))
      : Math.max(8, Math.round(selection.y + 24));

  const top = mode === 'toolbar' ? toolbarTop : composerTop;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['highlights', articleId] });
    void queryClient.invalidateQueries({ queryKey: ['library', 'highlights'] });
    void queryClient.invalidateQueries({ queryKey: feedKeys.all });
  };

  const handleHighlight = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiClient.createHighlight(articleId, {
        text: selection.text,
        quoteOrdinal: selection.index,
        isPublic: false,
      });
      if (!res.ok) throw new Error(res.error);
      invalidate();
      Toast.show(t('article.selection_highlight_done', 'Passage surligné'), 'success');
      onClose();
    } catch {
      Toast.show(t('article.selection_error', "Impossible d'envoyer"), 'error');
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(selection.text);
      Toast.show(t('article.selection_copied', 'Extrait copié dans le presse-papiers'), 'success');
    } catch {
      Toast.show(t('article.selection_error', "Impossible d'envoyer"), 'error');
    }
    onClose();
  };

  /** Annoter : crée un surlignage avec la note saisie. */
  const handleSubmitNote = async (note: string) => {
    const res = await apiClient.createHighlight(articleId, {
      text: selection.text,
      note: note.trim(),
      quoteOrdinal: selection.index,
      isPublic: false,
    });
    if (!res.ok) throw new Error(res.error);
    invalidate();
    Toast.show(t('article.selection_note_done', 'Annotation ajoutée'), 'success');
    onClose();
  };

  /** Citer : crée une pensée citant l'article + l'extrait (contrat web). */
  const handleSubmitQuote = async (commentary: string) => {
    const res = await apiClient.createThought(commentary.trim(), {
      quotedArticleId: articleId,
      quotedExcerpt: selection.text,
    });
    if (!res.ok) throw new Error(res.error);
    invalidate();
    Toast.show(t('article.selection_quote_done', 'Extrait cité dans une pensée'), 'success');
    onClose();
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={[styles.wrap, { top }]}
      pointerEvents="box-none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs(w - containerWidth) > 1) {
          setContainerWidth(w);
        }
      }}
    >
      {mode === 'toolbar' ? (
        <AppleCalloutMenu
          isAbove={isAbove}
          targetX={selection.x}
          containerWidth={containerWidth}
          busy={busy}
          onHighlight={() => void handleHighlight()}
          onQuote={() => {
            playHaptic('Light');
            setMode('quote');
          }}
          onAnnotate={() => {
            playHaptic('Light');
            setMode('note');
          }}
          onCopy={() => void handleCopy()}
        />
      ) : (
        <View
          style={styles.composerWrap}
          collapsable={false}
          onStartShouldSetResponder={() => true}
        >
          <GlassComposer
            position="floating"
            initialExpanded
            floatingTop={0}
            placeholder={
              mode === 'quote'
                ? t('article.selection_quote_placeholder', 'Commentez l’extrait…')
                : t('article.selection_note_placeholder', 'Votre annotation…')
            }
            quotedChip={
              <QuoteChip
                text={selection.text}
                onCancel={() => {
                  playHaptic('Light');
                  setMode('toolbar');
                }}
              />
            }
            expandedHeight={160}
            slotExpandable={false}
            onSubmit={mode === 'quote' ? handleSubmitQuote : handleSubmitNote}
          />
        </View>
      )}
    </Animated.View>
  );
}

// ─── Menu Callout Style Apple ──────────────────────────────────────────

interface AppleCalloutMenuProps {
  isAbove: boolean;
  targetX?: number;
  containerWidth: number;
  busy: boolean;
  onHighlight: () => void;
  onQuote: () => void;
  onAnnotate: () => void;
  onCopy: () => void;
}

function AppleCalloutMenu({
  isAbove,
  targetX,
  containerWidth,
  busy,
  onHighlight,
  onQuote,
  onAnnotate,
  onCopy,
}: AppleCalloutMenuProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [pillWidth, setPillWidth] = useState(290);

  // Signature Apple : capsule sombre avec typographie blanche et contraste maximal
  const bg = isDark ? '#2C2C30' : '#1C1C1E';
  const border = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.16)';
  const textColor = '#FFFFFF';
  const separatorColor = 'rgba(255, 255, 255, 0.20)';
  const pressedBg = 'rgba(255, 255, 255, 0.18)';

  // Positionnement dynamique style Apple :
  // 1. La capsule se centre autour du passage sélectionné (targetX) et est
  //    clampée dans les marges de l'écran ([8, containerWidth - pillWidth - 8]).
  // 2. La flèche (caret) glisse le long de la capsule pour pointer précisément
  //    sur targetX (clampée entre 16px et pillWidth - 16px pour ne pas déborder).
  const resolvedTargetX = targetX ?? containerWidth / 2;
  const idealLeft = resolvedTargetX - pillWidth / 2;
  const pillLeft = Math.max(8, Math.min(containerWidth - pillWidth - 8, idealLeft));
  const relativeX = resolvedTargetX - pillLeft;
  const caretOffset = Math.max(16, Math.min(pillWidth - 16, relativeX));
  const caretLeft = Math.round(caretOffset - 7);

  return (
    <View
      style={[
        styles.appleContainer,
        {
          left: Math.round(pillLeft),
          width: pillWidth,
        },
      ]}
      pointerEvents="box-none"
    >
      {!isAbove && (
        <View
          style={[
            styles.caretUp,
            {
              borderBottomColor: bg,
              marginLeft: caretLeft,
            },
          ]}
        />
      )}
      <View
        style={[styles.applePill, { backgroundColor: bg, borderColor: border }]}
        collapsable={false}
        onStartShouldSetResponder={() => true}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - pillWidth) > 1) {
            setPillWidth(w);
          }
        }}
      >
        {busy ? (
          <ActivityIndicator color={textColor} size="small" style={styles.busySpinner} />
        ) : (
          <>
            <AppleMenuItem
              label={t('article.selection_highlight', 'Surligner')}
              onPress={onHighlight}
              textColor={textColor}
              pressedBg={pressedBg}
            />
            <View style={[styles.appleSeparator, { backgroundColor: separatorColor }]} />
            <AppleMenuItem
              label={t('article.selection_quote', 'Citer')}
              onPress={onQuote}
              textColor={textColor}
              pressedBg={pressedBg}
            />
            <View style={[styles.appleSeparator, { backgroundColor: separatorColor }]} />
            <AppleMenuItem
              label={t('article.selection_note', 'Annoter')}
              onPress={onAnnotate}
              textColor={textColor}
              pressedBg={pressedBg}
            />
            <View style={[styles.appleSeparator, { backgroundColor: separatorColor }]} />
            <AppleMenuItem
              label={t('article.selection_copy', 'Copier')}
              onPress={onCopy}
              textColor={textColor}
              pressedBg={pressedBg}
            />
          </>
        )}
      </View>
      {isAbove && (
        <View
          style={[
            styles.caretDown,
            {
              borderTopColor: bg,
              marginLeft: caretLeft,
            },
          ]}
        />
      )}
    </View>
  );
}

function AppleMenuItem({
  label,
  onPress,
  textColor,
  pressedBg,
}: {
  label: string;
  onPress: () => void;
  textColor: string;
  pressedBg: string;
}) {
  return (
    <Pressable
      onPress={() => {
        playHaptic('Light');
        onPress();
      }}
      style={({ pressed }) => [styles.appleItem, pressed && { backgroundColor: pressedBg }]}
    >
      <ThemedText style={[styles.appleItemText, { color: textColor }]}>{label}</ThemedText>
    </Pressable>
  );
}

function QuoteChip({ text, onCancel }: { text: string; onCancel?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.quoteChip,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}
    >
      <View style={styles.quoteChipRow}>
        <ThemedText
          numberOfLines={2}
          style={[styles.quoteChipText, { color: theme.textSecondary }]}
        >
          « {text} »
        </ThemedText>
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            hitSlop={8}
            style={styles.quoteCancelButton}
            accessibilityLabel={t('common.cancel', 'Annuler')}
          >
            <X size={14} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 95,
    elevation: 12,
  },
  composerWrap: {
    width: '100%',
    minHeight: 50,
  },
  appleContainer: {
    position: 'relative',
    alignItems: 'flex-start',
  },
  applePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: POPOVER_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 8,
  },
  appleItem: {
    paddingHorizontal: 14,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleItemText: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  appleSeparator: {
    width: StyleSheet.hairlineWidth,
    height: 18,
  },
  caretDown: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: CARET_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -StyleSheet.hairlineWidth,
  },
  caretUp: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: CARET_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  busySpinner: {
    paddingHorizontal: 24,
  },
  quoteChip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quoteChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quoteChipText: {
    flex: 1,
    fontSize: 12,
    fontStyle: 'italic',
  },
  quoteCancelButton: {
    padding: 2,
  },
});
