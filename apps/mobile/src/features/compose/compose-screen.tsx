import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhoCanReplyPicker, type ReplyRestriction } from '@/components/thought/who-can-reply';
import { CharProgress } from '@/features/compose/char-progress';
import { deleteDraft, getDraft, saveDraft } from '@/features/compose/drafts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import { feedKeys } from '@qoe/sdk/mobile';

// =====================================================================
// ✍️ ComposeScreen — Composer de pensée (modal)
// =====================================================================
// POST /v1/posts (createThought). Gère la réponse à une pensée (parentId),
// le compteur de caractères (280 max, comme le web), et l'invalidation du
// cache feed + thread après envoi. Bouton « Poster » désactivé si vide.
// =====================================================================

const MAX_LENGTH = 280;

export function ComposeScreen({
  parentId,
  replyingTo,
  parentContent,
  repostId,
  quotedAuthor,
  quotedText,
}: {
  parentId?: string;
  replyingTo?: string; // handle de la pensée à laquelle on répond
  parentContent?: string; // extrait de la pensée à laquelle on répond
  repostId?: string; // citation : id de la pensée référencée
  quotedAuthor?: string; // handle de l'auteur cité (aperçu)
  quotedText?: string; // extrait de la pensée citée (aperçu)
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const draftKey = parentId ?? repostId ?? 'new';
  const [text, setText] = useState(() => getDraft(draftKey)?.text ?? '');
  const [replyRestriction, setReplyRestriction] = useState<ReplyRestriction>('everyone');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canPost = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !posting;

  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const res = await apiClient.createThought(trimmed, {
        ...(parentId ? { parentId } : {}),
        ...(repostId ? { repostId } : {}),
        ...(replyRestriction !== 'everyone' ? { replyRestriction } : {}),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      deleteDraft(draftKey);
      // Invalide le feed et le fil parent (si réponse).
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      if (parentId) {
        await queryClient.invalidateQueries({ queryKey: feedKeys.thread(parentId) });
      }
      router.back();
    } finally {
      setPosting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <SafeAreaView edges={['bottom']} style={styles.flex}>
          {/* Contexte de réponse */}
          {replyingTo ? (
            <View style={styles.replyContext}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {t('compose.replying_to', 'En réponse à')}{' '}
                <ThemedText type="smallBold">@{replyingTo}</ThemedText>
              </ThemedText>
              {parentContent ? (
                <ThemedText type="small" numberOfLines={3} style={{ color: theme.textSecondary }}>
                  {parentContent}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {/* Aperçu de la pensée citée (mode citation) */}
          {repostId && (quotedAuthor || quotedText) ? (
            <ThemedView type="backgroundElement" style={styles.quotePreview}>
              {quotedAuthor ? (
                <ThemedText type="smallBold" numberOfLines={1}>
                  @{quotedAuthor}
                </ThemedText>
              ) : null}
              {quotedText ? (
                <ThemedText type="small" numberOfLines={4} style={{ color: theme.textSecondary }}>
                  {quotedText}
                </ThemedText>
              ) : null}
            </ThemedView>
          ) : null}

          {/* Zone de saisie */}
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (error) setError(null);
              saveDraft({ text: v, parentId, repostId });
            }}
            placeholder={t('compose.placeholder', 'Exprimez votre pensée…')}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={MAX_LENGTH + 50} // laisse de la marge pour afficher le dépassement
            autoFocus
          />

          {/* Erreur */}
          {error ? (
            <ThemedText type="small" style={{ color: theme.destructive }}>
              {error}
            </ThemedText>
          ) : null}

          {/* Pied : restriction + compteur + bouton poster */}
          <View style={styles.footer}>
            <WhoCanReplyPicker value={replyRestriction} onChange={setReplyRestriction} />
            <View style={styles.footerRight}>
              <CharProgress count={text.length} max={MAX_LENGTH} />
              <Pressable
                onPress={() => void submit()}
                disabled={!canPost}
                style={({ pressed }) => [
                  styles.postButton,
                  {
                    backgroundColor: canPost
                      ? pressed
                        ? theme.backgroundSelected
                        : theme.primary
                      : theme.backgroundSelected,
                  },
                ]}
              >
                {posting ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <ThemedText
                    type="smallBold"
                    style={{ color: canPost ? '#ffffff' : theme.textSecondary }}
                  >
                    {t('compose.post', 'Poster')}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  replyContext: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  quotePreview: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  input: {
    flex: 1,
    padding: Spacing.three,
    fontSize: 18,
    lineHeight: 26,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  postButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
});
