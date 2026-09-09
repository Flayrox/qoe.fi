// =====================================================================
// 🖍️ HighlightActionsPopover — Menu d'actions d'un surlignage (tap)
// =====================================================================
// Ouvert quand on TAPE sur un <mark> inline (même style Apple Callout
// que la sélection) :
//   - si le surlignage porte une note, elle s'affiche (annotation) — un
//     peu comme le panneau d'annotation du web ;
//   - actions : Annoter (ajouter/éditer la note), Citer (citer l'extrait
//     dans une pensée), Supprimer (si c'est le mien, avec confirmation).
// Toutes les actions sont OPTIMISTES : le cache react-query est mis à
// jour immédiatement, le popover se ferme, et l'appel serveur part en
// arrière-plan (rollback + toast en cas d'échec). Pour un surlignage
// encore en file locale (pending), on met à jour/retire la file.
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { GlassComposer } from '@/components/composer/glass-composer';
import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { playHaptic } from '@/lib/haptics';
import { removePendingHighlight, updatePendingHighlightNote } from '@/lib/highlight-queue';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';
import type { Highlight } from '@qoe/sdk/mobile';
import type { HighlightLike } from '@/components/article/html-blocks-core';

type Mode = 'menu' | 'annotate' | 'quote';

const POPOVER_HEIGHT = 38;
const CARET_HEIGHT = 6;
const LINE_HEIGHT = 26;

export function HighlightActionsPopover({
  highlight,
  articleId,
  point,
  onClose,
}: {
  highlight: HighlightLike;
  articleId: string;
  point: { x: number; y: number };
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(() => Math.max(0, windowWidth - 32));
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);

  const mine = highlight.readerId != null && highlight.readerId === myId;
  const isPending = highlight.pending === true;
  const hasNote = Boolean(highlight.note?.trim());

  const isAbove = point.y >= 40;
  const pillTop = isAbove
    ? Math.max(8, Math.round(point.y - LINE_HEIGHT / 2 - POPOVER_HEIGHT - CARET_HEIGHT - 6))
    : Math.max(8, Math.round(point.y + LINE_HEIGHT / 2 + 6));
  // Avec la carte d'annotation AU-DESSUS du menu (pill au-dessus de la
  // ligne), on remonte la colonne pour la laisser respirer.
  const top =
    mode === 'menu' && hasNote && isAbove
      ? Math.max(8, pillTop - 76)
      : mode === 'menu'
        ? pillTop
        : point.y >= 180
          ? Math.max(8, Math.round(point.y - 170))
          : Math.max(8, Math.round(point.y + 24));

  const invalidateLibrary = () => {
    void queryClient.invalidateQueries({ queryKey: ['library', 'highlights'] });
  };

  /** Annoter : ajoute/édite la note — optimiste + PATCH en arrière-plan. */
  const handleSubmitNote = (note: string) => {
    if (busy) return;
    setBusy(true);
    const trimmed = note.trim();
    const done = () => {
      Toast.show(
        trimmed
          ? t('article.selection_note_done', 'Annotation ajoutée')
          : t('highlights.note_removed', 'Annotation retirée'),
        'success'
      );
      onClose();
    };
    if (isPending && highlight.localId) {
      void updatePendingHighlightNote(highlight.localId, trimmed || null).then(done);
      return;
    }
    const id = highlight.id;
    if (!id) {
      done();
      return;
    }
    // Optimiste : le cache affiche la note tout de suite.
    const prev = queryClient.getQueryData<Highlight[]>(['highlights', articleId]);
    queryClient.setQueryData<Highlight[]>(['highlights', articleId], (old) =>
      (old ?? []).map((h) => (h.id === id ? { ...h, note: trimmed || null } : h))
    );
    done();
    // PATCH en arrière-plan ; rollback + toast si échec.
    void (async () => {
      const res = await apiClient.updateHighlight(id, { note: trimmed || null });
      if (!res.ok) {
        if (prev) queryClient.setQueryData(['highlights', articleId], prev);
        Toast.show(t('highlights.error', 'Impossible de mettre à jour'), 'error');
        return;
      }
      invalidateLibrary();
    })();
  };

  /** Citer : crée une pensée citant l'article + l'extrait (contrat web). */
  const handleSubmitQuote = (commentary: string) => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      const res = await apiClient.createThought(commentary.trim(), {
        quotedArticleId: articleId,
        quotedExcerpt: highlight.text ?? '',
      });
      if (!res.ok) {
        Toast.show(t('article.selection_error', "Impossible d'envoyer"), 'error');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      Toast.show(t('article.selection_quote_done', 'Extrait cité dans une pensée'), 'success');
      onClose();
    })();
  };

  /** Supprimer (le mien) : optimiste + DELETE en arrière-plan. */
  const confirmDelete = () => {
    Alert.alert(
      t('highlights.delete_confirm_title', 'Supprimer ce surlignage ?'),
      t('highlights.delete_confirm_message', 'Cette action est définitive.'),
      [
        { text: t('common.cancel', 'Annuler'), style: 'cancel' },
        {
          text: t('common.delete', 'Supprimer'),
          style: 'destructive',
          onPress: () => void remove(),
        },
      ]
    );
  };

  const remove = () => {
    if (busy) return;
    setBusy(true);
    const done = () => {
      Toast.show(t('highlights.delete_done', 'Surlignage supprimé'), 'success');
      onClose();
    };
    if (isPending && highlight.localId) {
      void removePendingHighlight(highlight.localId).then(done);
      return;
    }
    const id = highlight.id;
    if (!id) {
      done();
      return;
    }
    const prev = queryClient.getQueryData<Highlight[]>(['highlights', articleId]);
    queryClient.setQueryData<Highlight[]>(['highlights', articleId], (old) =>
      (old ?? []).filter((h) => h.id !== id)
    );
    done();
    void (async () => {
      const res = await apiClient.deleteHighlight(id);
      if (!res.ok) {
        if (prev) queryClient.setQueryData(['highlights', articleId], prev);
        Toast.show(t('highlights.error', 'Impossible de mettre à jour'), 'error');
        return;
      }
      invalidateLibrary();
    })();
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={[styles.wrap, { top }]}
      pointerEvents="box-none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs(w - containerWidth) > 1) setContainerWidth(w);
      }}
    >
      {mode === 'menu' ? (
        <View style={styles.column} collapsable={false}>
          {hasNote ? (
            <View
              style={[
                styles.noteCard,
                { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
              ]}
            >
              <MessageSquare size={14} color={theme.primary} />
              <ThemedText type="small" numberOfLines={3} style={styles.noteText}>
                {highlight.note}
              </ThemedText>
            </View>
          ) : null}
          <HighlightCallout
            isAbove={isAbove}
            targetX={point.x}
            containerWidth={containerWidth}
            busy={busy}
            mine={mine}
            onAnnotate={() => {
              playHaptic('Light');
              setMode('annotate');
            }}
            onQuote={() => {
              playHaptic('Light');
              setMode('quote');
            }}
            onDelete={confirmDelete}
          />
        </View>
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
                text={highlight.text ?? ''}
                onCancel={() => {
                  playHaptic('Light');
                  setMode('menu');
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

// ─── Callout Apple (menu d'actions) ─────────────────────────────────

function HighlightCallout({
  isAbove,
  targetX,
  containerWidth,
  busy,
  mine,
  onAnnotate,
  onQuote,
  onDelete,
}: {
  isAbove: boolean;
  targetX?: number;
  containerWidth: number;
  busy: boolean;
  mine: boolean;
  onAnnotate: () => void;
  onQuote: () => void;
  onDelete: () => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [pillWidth, setPillWidth] = useState(260);

  const bg = isDark ? '#1C1C1E' : '#FFFFFF';
  const border = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const separatorColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.10)';
  const pressedBg = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.07)';
  const shadowOpacity = isDark ? 0.32 : 0.14;
  const destructiveColor = isDark ? '#FF6B6B' : '#D70015';

  const resolvedTargetX = targetX ?? containerWidth / 2;
  const idealLeft = resolvedTargetX - pillWidth / 2;
  const pillLeft = Math.max(8, Math.min(containerWidth - pillWidth - 8, idealLeft));
  const relativeX = resolvedTargetX - pillLeft;
  const caretOffset = Math.max(16, Math.min(pillWidth - 16, relativeX));
  const caretLeft = Math.round(caretOffset - 7);

  return (
    <View
      style={[styles.appleContainer, { left: Math.round(pillLeft), width: pillWidth }]}
      pointerEvents="box-none"
    >
      {!isAbove && (
        <View style={[styles.caretUp, { borderBottomColor: bg, marginLeft: caretLeft }]} />
      )}
      <View
        style={[styles.applePill, { backgroundColor: bg, borderColor: border, shadowOpacity }]}
        collapsable={false}
        onStartShouldSetResponder={() => true}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - pillWidth) > 1) setPillWidth(w);
        }}
      >
        {busy ? (
          <ActivityIndicator color={textColor} size="small" style={styles.busySpinner} />
        ) : (
          <>
            {mine ? (
              <>
                <AppleActionItem
                  label={t('article.selection_note', 'Annoter')}
                  onPress={onAnnotate}
                  textColor={textColor}
                  pressedBg={pressedBg}
                />
                <View style={[styles.appleSeparator, { backgroundColor: separatorColor }]} />
              </>
            ) : null}
            <AppleActionItem
              label={t('article.selection_quote', 'Citer')}
              onPress={onQuote}
              textColor={textColor}
              pressedBg={pressedBg}
            />
            {mine ? (
              <>
                <View style={[styles.appleSeparator, { backgroundColor: separatorColor }]} />
                <AppleActionItem
                  label={t('highlights.delete', 'Supprimer')}
                  onPress={onDelete}
                  textColor={destructiveColor}
                  pressedBg={pressedBg}
                />
              </>
            ) : null}
          </>
        )}
      </View>
      {isAbove && (
        <View style={[styles.caretDown, { borderTopColor: bg, marginLeft: caretLeft }]} />
      )}
    </View>
  );
}

function AppleActionItem({
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
  column: {
    alignItems: 'flex-start',
    gap: 6,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 280,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  noteText: {
    flex: 1,
    lineHeight: 18,
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
