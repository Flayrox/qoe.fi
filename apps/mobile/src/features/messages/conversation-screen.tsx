// =====================================================================
// 💬 ConversationScreen — Fil de messagerie directe (mobile)
// =====================================================================
// Liste inversée (nouveaux messages en bas), remontée par polling 4 s
// (tranche 1 — Realtime Supabase en tranche ultérieure), envoi optimiste,
// marquage lu à l'ouverture + à chaque nouveau message reçu.
// =====================================================================

import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { Avatar } from '@/components/thought/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Conversation, DirectMessage } from '@qoe/sdk/mobile';
import { conversationKeys } from '@qoe/sdk/mobile';

const POLL_MS = 4000;
const PAGE_SIZE = 50;

function nameOf(c: Conversation): string {
  return c.participant.name || c.participant.username || t('messages.user', 'Utilisateur');
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversationError, setConversationError] = useState(false);
  // Nouveau → ancien (liste inversée : index 0 = visuellement en bas).
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const me = conversation;

  // ─── Chargement initial : détail + dernière page de messages ───────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const [convRes, msgsRes] = await Promise.all([
        apiClient.getConversation(conversationId),
        apiClient.getConversationMessages(conversationId, { limit: PAGE_SIZE }),
      ]);
      if (cancelled) return;
      if (convRes.ok) setConversation(convRes.data);
      if (convRes.ok || msgsRes.ok) {
        if (msgsRes.ok) {
          // La page arrive ascendante → on inverse pour la liste (nouveau en premier).
          setMessages([...msgsRes.data.messages].reverse());
          setHasMore(msgsRes.data.hasMore);
        }
      } else {
        setConversationError(true);
      }
      setLoading(false);
      // Marquage lu à l'ouverture.
      void apiClient.markConversationRead(conversationId);
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, queryClient]);

  // ─── Polling des nouveaux messages ──────────────────────────────────
  const poll = useCallback(async () => {
    const res = await apiClient.getConversationMessages(conversationId, { limit: PAGE_SIZE });
    if (!res.ok) return;
    setMessages((prev) => {
      const byId = new Map<string, DirectMessage>();
      for (const m of prev) byId.set(m.id, m);
      let added = false;
      for (const m of res.data.messages) {
        if (!byId.has(m.id)) {
          byId.set(m.id, m);
          added = true;
        }
      }
      if (!added) return prev;
      return [...byId.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    // Marquage lu tant que le fil est ouvert (upsert peu coûteux).
    void apiClient.markConversationRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => void poll(), POLL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [poll]);

  // ─── Pagination arrière (charger les plus anciens) ──────────────────
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    setLoadingOlder(true);
    const res = await apiClient.getConversationMessages(conversationId, {
      before: oldest.createdAt,
      limit: PAGE_SIZE,
    });
    if (res.ok && res.data.messages.length > 0) {
      setHasMore(res.data.hasMore);
      setMessages((prev) => [...prev, ...[...res.data.messages].reverse()]);
    }
    setLoadingOlder(false);
  }, [conversationId, hasMore, loadingOlder, messages]);

  // ─── Envoi (optimiste) ──────────────────────────────────────────────
  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    const temp: DirectMessage = {
      id: `local-${Date.now()}`,
      senderId: '__me__',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [temp, ...prev]);
    setDraft('');
    const res = await apiClient.sendMessage(conversationId, content);
    if (res.ok) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? res.data : m)));
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(content);
      setSendError(res.error);
    }
    setSending(false);
  }, [conversationId, draft, sending, queryClient]);

  const participant = me?.participant;

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (conversationError || !participant) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small">
          {t('messages.conversation_error', 'Conversation introuvable')}
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 8 }}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t('common.back', 'Retour')}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const isMine = (m: DirectMessage) => m.senderId !== participant.id || m.senderId === '__me__';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        {/* ─── Header : retour + participant ─── */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
            ]}
            accessibilityLabel={t('common.back', 'Retour')}
          >
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={20}
              tintColor={theme.text}
              weight="semibold"
            />
          </Pressable>
          <Avatar
            user={{
              name: participant.name,
              username: participant.username,
              logoUrl: participant.logoUrl,
            }}
            size="xs"
            showCertified={participant.isCertified}
          />
          <View style={styles.headerText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {nameOf(me)}
            </ThemedText>
            {participant.username ? (
              <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 11 }}>
                @{participant.username}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView edges={['bottom']} style={styles.flex}>
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item: m }: ListRenderItemInfo<DirectMessage>) => {
              const mine = isMine(m);
              const pending = m.id.startsWith('local-');
              return (
                <View style={styles.bubbleRow}>
                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: mine ? theme.primary : theme.backgroundElement,
                        borderBottomLeftRadius: mine ? Spacing.two : 4,
                        borderBottomRightRadius: mine ? 4 : Spacing.two,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[styles.bubbleText, { color: mine ? '#ffffff' : theme.text }]}
                    >
                      {m.content}
                    </ThemedText>
                    <View style={styles.bubbleMeta}>
                      <ThemedText
                        style={[
                          styles.bubbleTime,
                          { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary },
                        ]}
                      >
                        {timeLabel(m.createdAt)}
                      </ThemedText>
                      {pending ? (
                        <ActivityIndicator size={8} color={theme.textSecondary} />
                      ) : mine ? (
                        <SymbolView
                          name={{ ios: 'checkmark', android: 'done', web: 'done' }}
                          size={10}
                          tintColor="rgba(255,255,255,0.7)"
                          weight="semibold"
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            }}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={
              // En liste inversée, le « header » est visuellement en HAUT :
              // indicateur de chargement des messages plus anciens.
              loadingOlder ? (
                <ActivityIndicator color={theme.textSecondary} style={styles.olderLoader} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {t('messages.thread_empty', 'Aucun message. Dites bonjour !')}
                </ThemedText>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />

          {sendError ? (
            <ThemedText
              type="small"
              style={[styles.sendError, { color: theme.destructive }]}
              numberOfLines={2}
            >
              {sendError}
            </ThemedText>
          ) : null}

          {/* ─── Composeur ─── */}
          <View style={[styles.composer, { borderTopColor: theme.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('messages.composer', 'Écrire un message…')}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                  maxHeight: 120,
                },
              ]}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || sending}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: pressed ? theme.primary : theme.text,
                  opacity: !draft.trim() || sending ? 0.4 : 1,
                },
              ]}
              accessibilityLabel={t('messages.send', 'Envoyer')}
            >
              <SymbolView
                name={{ ios: 'arrow.up', android: 'send', web: 'send' }}
                size={18}
                tintColor={theme.background}
                weight="bold"
              />
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeTop: { backgroundColor: 'transparent' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: Spacing.two,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  olderLoader: {
    paddingVertical: Spacing.two,
  },
  bubbleRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: 3,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  bubbleTime: {
    fontSize: 9,
  },
  sendError: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
    fontSize: 12,
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 42,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
