// =====================================================================
// 🖍️ SelectionPopover — Barre d'actions sur un passage d'article (morph)
// =====================================================================
// Appui long sur un bloc de texte → barre flottante au-dessus du passage :
//   ✍️ Surligner · ❝ Citer · 💬 Annoter · ⧉ Copier
// « Citer » / « Annoter » font MORPHER la barre en composeur (GlassComposer
// partagé — le même composant que le composer de répondre aux pensées) :
// la boîte se développe, l'extrait cité apparaît en chip, on écrit et on
// envoie. Tout passe par l'API Go existante (highlights + posts).
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Copy, Highlighter, MessageSquare, Quote } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { GlassComposer } from '@/components/composer/glass-composer';
import { ThemedText } from '@/components/themed-text';
import { Toast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';
import type { SelectionInfo } from '@/components/article/html-blocks';

type PopoverMode = 'toolbar' | 'quote' | 'note';

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
  const [mode, setMode] = useState<PopoverMode>('toolbar');
  const [busy, setBusy] = useState(false);

  const top = Math.max(8, selection.y - 58);

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
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <GlassComposer
        position="floating"
        floatingTop={0}
        placeholder={
          mode === 'quote'
            ? t('article.selection_quote_placeholder', 'Commentez l’extrait…')
            : t('article.selection_note_placeholder', 'Votre annotation…')
        }
        quotedChip={mode === 'toolbar' ? undefined : <QuoteChip text={selection.text} />}
        expandedHeight={160}
        slotExpandable={false}
        collapsedSlot={({ expand }) => (
          <View style={styles.toolbarRow}>
            {busy ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <>
                <ToolChip
                  label={t('article.selection_highlight', 'Surligner')}
                  icon={<Highlighter size={14} color={theme.text} />}
                  onPress={() => void handleHighlight()}
                />
                <ToolChip
                  label={t('article.selection_quote', 'Citer')}
                  icon={<Quote size={14} color={theme.text} />}
                  onPress={() => {
                    setMode('quote');
                    expand();
                  }}
                />
                <ToolChip
                  label={t('article.selection_note', 'Annoter')}
                  icon={<MessageSquare size={14} color={theme.text} />}
                  onPress={() => {
                    setMode('note');
                    expand();
                  }}
                />
                <ToolChip
                  label={t('article.selection_copy', 'Copier')}
                  icon={<Copy size={14} color={theme.text} />}
                  onPress={() => void handleCopy()}
                />
              </>
            )}
          </View>
        )}
        onSubmit={mode === 'quote' ? handleSubmitQuote : handleSubmitNote}
      />
    </View>
  );
}

function ToolChip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.chipRow}>
        {icon}
        <ThemedText type="small" style={styles.chipText}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function QuoteChip({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.quoteChip,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}
    >
      <ThemedText numberOfLines={2} style={[styles.quoteChipText, { color: theme.textSecondary }]}>
        « {text} »
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 95,
  },
  toolbarRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontWeight: '600',
  },
  quoteChip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quoteChipText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
