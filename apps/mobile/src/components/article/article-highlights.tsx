import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, Globe, Lock, MessageSquare } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { HighlightRowActions } from '@/components/article/highlight-row-actions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { enqueueHighlightCreate, flushPendingHighlights } from '@/lib/highlight-queue';
import { toLocalHighlight, type PendingHighlightCreate } from '@/lib/highlight-queue-core';
import { t } from '@/lib/i18n';
import type { Highlight } from '@qoe/sdk/mobile';

// =====================================================================
// 🖍️ ArticleHighlights — Surlignages d'un article (mobile)
// =====================================================================
// Affiche les surlignages publics + les miens (GET /v1/articles/{id}/highlights),
// avec upvote optimiste. Un bouton « + » ouvre un formulaire inline pour
// créer un surlignage (texte du passage + note optionnelle + public/privé).
// =====================================================================

export function ArticleHighlights({
  articleId,
  pendingCreates = [],
}: {
  articleId: string;
  /** Créations locales en attente de synchro (rendu optimiste). */
  pendingCreates?: PendingHighlightCreate[];
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [creating, setCreating] = useState(false);

  const queryKey = ['highlights', articleId];

  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.getArticleHighlights(articleId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const upvote = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.toggleHighlightUpvote(id);
      if (!res.ok) throw new Error(res.error);
      return { id, ...res.data };
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Highlight[]>(queryKey);
      queryClient.setQueryData<Highlight[]>(queryKey, (old) =>
        (old ?? []).map((h) =>
          h.id === id
            ? {
                ...h,
                viewerUpvoted: !h.viewerUpvoted,
                upvotesCount: h.upvotesCount + (h.viewerUpvoted ? -1 : 1),
              }
            : h
        )
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
  });

  // Fusion optimiste : surlignages serveur + créations locales en attente
  // (celles-ci portent `pending: true` → badge + pas d'actions serveur).
  const items = useMemo(() => {
    const locals = pendingCreates.map((p) => toLocalHighlight(p, myId, null));
    return [...locals, ...(data ?? [])];
  }, [pendingCreates, data, myId]);

  if (isPending) {
    return (
      <View style={styles.section}>
        <SectionHeader />
        <ActivityIndicator color={theme.text} style={styles.loading} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <SectionHeader />
        <Pressable onPress={() => void refetch()}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t('highlights.retry', 'Réessayer le chargement des surlignages')}
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader />

      {/* Bouton créer */}
      <Pressable
        onPress={() => setCreating((v) => !v)}
        style={({ pressed }) => [
          styles.createButton,
          { backgroundColor: theme.backgroundSelected },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {creating ? '−' : '+'} {t('highlights.add', 'Surligner un passage')}
        </ThemedText>
      </Pressable>

      {/* Formulaire inline */}
      {creating ? <HighlightForm articleId={articleId} onDone={() => setCreating(false)} /> : null}

      {/* Liste */}
      {items.length === 0 ? (
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {t('highlights.empty', 'Aucun surlignage pour le moment')}
        </ThemedText>
      ) : (
        items.map((h) => {
          const mine = myId != null && h.readerId === myId;
          const isPending = (h as { pending?: boolean }).pending === true;
          return (
            <ThemedView key={h.id} type="card" style={styles.highlightCard}>
              <ThemedText style={styles.highlightText}>« {h.text} »</ThemedText>
              {h.note ? (
                <View style={styles.noteRow}>
                  <MessageSquare size={14} color={theme.primary} />
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    {h.note}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  @{h.reader.username || h.reader.name || '…'}
                  {h.isOfficial ? ' · ✓' : ''}
                </ThemedText>
                {!isPending ? (
                  <Pressable
                    onPress={() => upvote.mutate(h.id)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.upvote, pressed && styles.pressed]}
                  >
                    <View style={styles.upvoteRow}>
                      <ChevronUp
                        size={14}
                        color={h.viewerUpvoted ? theme.primary : theme.textSecondary}
                        strokeWidth={h.viewerUpvoted ? 3 : 2}
                      />
                      <ThemedText
                        type="small"
                        style={{
                          color: h.viewerUpvoted ? theme.primary : theme.textSecondary,
                          fontWeight: h.viewerUpvoted ? '700' : '400',
                        }}
                      >
                        {h.upvotesCount}
                      </ThemedText>
                    </View>
                  </Pressable>
                ) : null}
              </View>
              {mine && isPending ? (
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {t('highlights.pending', '⏳ En attente de synchro')}
                </ThemedText>
              ) : null}
              {mine && !isPending ? (
                <HighlightRowActions highlightId={h.id} isPublic={h.isPublic} />
              ) : null}
            </ThemedView>
          );
        })
      )}
    </View>
  );
}

function SectionHeader() {
  return (
    <ThemedText style={styles.sectionTitle}>{t('highlights.title', 'Surlignages')}</ThemedText>
  );
}

function HighlightForm({ articleId, onDone }: { articleId: string; onDone: () => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Enregistrement INSTANTANÉ en local + synchro différée (file). */
  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await enqueueHighlightCreate({
        articleId,
        text: trimmed,
        note: note.trim() || null,
        isPublic,
        quoteOrdinal: 0,
      });
      // Synchro en arrière-plan — jamais bloquant.
      void flushPendingHighlights();
      setText('');
      setNote('');
      setIsPublic(false);
      onDone();
    } catch {
      setError(t('highlights.error', 'Impossible de mettre à jour'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView type="card" style={styles.form}>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        value={text}
        onChangeText={setText}
        placeholder={t('highlights.text_placeholder', 'Le passage à surligner…')}
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={500}
      />
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        value={note}
        onChangeText={setNote}
        placeholder={t('highlights.note_placeholder', 'Note (optionnel)…')}
        placeholderTextColor={theme.textSecondary}
        maxLength={200}
      />
      <View style={styles.formRow}>
        <Pressable
          onPress={() => setIsPublic((v) => !v)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <View style={styles.toggleRow}>
            {isPublic ? (
              <Globe size={14} color={theme.primary} />
            ) : (
              <Lock size={14} color={theme.textSecondary} />
            )}
            <ThemedText
              type="small"
              style={{ color: isPublic ? theme.primary : theme.textSecondary, fontWeight: '600' }}
            >
              {t('highlights.visibility', isPublic ? 'Public' : 'Privé')}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          onPress={() => void submit()}
          disabled={!text.trim() || saving}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor:
                !text.trim() || saving
                  ? theme.backgroundSelected
                  : pressed
                    ? theme.backgroundSelected
                    : theme.primary,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={theme.primary} size="small" />
          ) : (
            <ThemedText
              type="smallBold"
              style={{ color: text.trim() ? '#ffffff' : theme.textSecondary }}
            >
              {t('highlights.save', 'Sauvegarder')}
            </ThemedText>
          )}
        </Pressable>
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.destructive }}>
          {error}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  loading: {
    paddingVertical: Spacing.three,
  },
  createButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
  highlightCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  highlightText: {
    fontSize: 15,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upvoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  upvote: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  form: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 44,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    paddingVertical: Spacing.one,
  },
  saveButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
});
