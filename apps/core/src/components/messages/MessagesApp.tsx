'use client';

// =====================================================================
// 💬 MessagesApp — Messagerie directe (web, /messages)
// =====================================================================
// Tranche 1 : conversations directes, remontée des nouveaux messages par
// POLLING léger (4-6 s). Le temps réel (Supabase Realtime / SSE) est une
// tranche ultérieure. Aucune dépendance au moteur d'annotations.
// =====================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, MessageCircle, PenLine, Search, Send } from 'lucide-react';
import {
  createConversationAction,
  getConversationMessagesAction,
  getConversationsAction,
  markConversationReadAction,
  sendMessageAction,
} from '@qoe/sdk/actions/messages';
import { searchUsersAction } from '@qoe/sdk/actions/feed';
import type { Conversation, DirectMessage } from '@qoe/sdk';

type SearchedUser = {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
};

const POLL_CONVERSATIONS_MS = 6000;
const POLL_MESSAGES_MS = 4000;

function displayName(c: Conversation): string {
  return c.participant.name || c.participant.username || 'Utilisateur';
}

function handle(c: Conversation): string {
  return c.participant.username ? `@${c.participant.username}` : '';
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function Avatar({ conversation, size = 40 }: { conversation: Conversation; size?: number }) {
  const p = conversation.participant;
  return p.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.logoUrl}
      alt={displayName(conversation)}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(p.name || p.username || '?')}
    </div>
  );
}

export function MessagesApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const markReadInFlight = useRef(false);

  // ─── Liste des conversations (chargement + polling) ─────────────────
  const refreshConversations = useCallback(async (silent = true) => {
    const res = await getConversationsAction();
    if (!res.ok) return;
    setConversations(res.data);
    setLoadingList(false);
    if (!silent && res.data.length === 0) setError(null);
  }, []);

  useEffect(() => {
    void refreshConversations(false);
    const t = setInterval(() => void refreshConversations(true), POLL_CONVERSATIONS_MS);
    return () => clearInterval(t);
  }, [refreshConversations]);

  // ─── Messages du fil sélectionné ────────────────────────────────────
  const openConversation = useCallback(async (conversation: Conversation) => {
    setSelectedId(conversation.id);
    setError(null);
    setLoadingMessages(true);
    const res = await getConversationMessagesAction({ conversationId: conversation.id });
    if (res.ok) setMessages(res.data.messages);
    setLoadingMessages(false);
    // Marquer lu à l'ouverture (le polling ci-dessous rappelle si besoin).
    void markConversationReadAction(conversation.id);
  }, []);

  const markReadIfNeeded = useCallback(() => {
    if (!selectedId || markReadInFlight.current) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) return;
    if (conv.unreadCount > 0) {
      markReadInFlight.current = true;
      void markConversationReadAction(selectedId).finally(() => {
        markReadInFlight.current = false;
        void refreshConversations(true);
      });
    }
  }, [selectedId, conversations, refreshConversations]);

  // Polling des messages quand un fil est ouvert.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const tick = async () => {
      const conv = conversations.find((c) => c.id === selectedId);
      if (!conv || cancelled) return;
      const res = await getConversationMessagesAction({ conversationId: selectedId });
      if (!res.ok || cancelled) return;
      const prevIds = new Set(messages.map((m) => m.id));
      const fresh = res.data.messages;
      const hasNew = fresh.some((m) => !prevIds.has(m.id));
      setMessages((prev) => {
        if (fresh.length === 0 && prev.length === 0) return prev;
        // Garde la liste locale (y compris l'envoi optimiste) + fusionne.
        const byId = new Map<string, DirectMessage>();
        for (const m of prev) byId.set(m.id, m);
        for (const m of fresh) byId.set(m.id, m);
        return [...byId.values()].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      if (hasNew) markReadIfNeeded();
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MESSAGES_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // `messages`/`conversations` sont volontairement exclus : le tick lit
    // l'état à jour via les mises à jour fonctionnelles de setMessages.
  }, [selectedId, markReadIfNeeded]);

  // Scroll en bas à chaque nouveau message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedId, loadingMessages]);

  // Marque lu quand la conversation redevient visible avec des non-lus.
  useEffect(() => {
    if (selected && selected.unreadCount > 0) markReadIfNeeded();
  }, [selected, markReadIfNeeded]);

  // ─── Envoi ───────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!selectedId || !draft.trim() || sending) return;
    const content = draft.trim();
    setSending(true);
    // Envoi optimiste : on affiche immédiatement, on corrige au prochain poll.
    const temp: DirectMessage = {
      id: `pending-${Date.now()}`,
      senderId: '__me__',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setDraft('');
    const res = await sendMessageAction({ conversationId: selectedId, content });
    if (!res.ok) {
      // Rollback : retire le message optimiste.
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(content);
      setError(res.error?.message || 'Envoi impossible');
    } else {
      // Remplace l'optimiste par le message confirmé (le poll suivant le fait
      // aussi ; ici on corrige tout de suite l'ordre/les ids).
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? res.data : m)));
      void refreshConversations(true);
    }
    setSending(false);
  }, [selectedId, draft, sending, refreshConversations]);

  // ─── Nouvelle conversation (recherche d'utilisateurs) ───────────────
  useEffect(() => {
    if (!composing || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void searchUsersAction(searchQuery.trim()).then((res) => {
        if (!cancelled && res.ok) setSearchResults(res.data.users.slice(0, 8));
        if (!cancelled) setSearching(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [composing, searchQuery]);

  const startConversation = useCallback(
    async (user: SearchedUser) => {
      const res = await createConversationAction(user.id);
      if (!res.ok) {
        setError(res.error?.message || 'Conversation impossible à créer');
        return;
      }
      setComposing(false);
      setSearchQuery('');
      setSearchResults([]);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === res.data.id);
        return exists ? prev : [res.data, ...prev];
      });
      await openConversation(res.data);
    },
    [openConversation]
  );

  // ─── Rendu ───────────────────────────────────────────────────────────
  const isMobileViewingThread =
    Boolean(selected) && typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <MessageCircle className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Messages</h1>
        <button
          onClick={() => setComposing((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:bg-primary/10 rounded-full px-3 py-1.5 transition-colors"
        >
          <PenLine className="w-4 h-4" />
          Nouveau message
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden h-[calc(100dvh-11rem)] min-h-[420px] grid md:grid-cols-[320px_1fr]">
        {/* ─── Panneau gauche : liste des conversations ─── */}
        <aside
          className={`${isMobileViewingThread ? 'hidden md:flex' : 'flex'} flex-col border-r border-border/60 bg-background/40`}
        >
          {composing && (
            <div className="p-3 border-b border-border/60 space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setComposing(false);
                  }}
                  placeholder="Chercher un membre…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {searching && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Recherche…
                  </div>
                )}
                {!searching &&
                  searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => void startConversation(u)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/60 text-left"
                    >
                      {u.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                          {initials(u.name || u.username || '?')}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {u.name || u.username || 'Utilisateur'}
                        </p>
                        {u.username && (
                          <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                        )}
                      </div>
                    </button>
                  ))}
                {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1.5">Aucun résultat.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {loadingList && (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            {!loadingList && conversations.length === 0 && !composing && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground space-y-2">
                <MessageCircle className="w-8 h-8 mx-auto opacity-50" />
                <p>Aucune conversation.</p>
                <p className="text-xs">
                  Envoyez votre premier message à un membre de la communauté.
                </p>
              </div>
            )}
            {conversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => void openConversation(c)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
                    active ? 'bg-primary/10' : 'hover:bg-muted/40'
                  }`}
                >
                  <Avatar conversation={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{displayName(c)}</p>
                      {c.lastMessage && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTime(c.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {c.lastMessage
                          ? c.lastMessage.senderId === c.participant.id
                            ? c.lastMessage.content
                            : `Vous : ${c.lastMessage.content}`
                          : handle(c) || 'Conversation vide'}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ─── Panneau droit : fil de conversation ─── */}
        <section className="flex flex-col min-w-0 bg-background/60">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground px-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-primary/60" />
              </div>
              <p className="text-sm font-medium text-foreground/70">Vos messages privés</p>
              <p className="text-xs text-center max-w-xs">
                Sélectionnez une conversation — ou lancez-en une nouvelle avec le bouton ci-dessus.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-muted/60"
                  aria-label="Retour"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar conversation={selected} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate leading-tight">
                    {displayName(selected)}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{handle(selected)}</p>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
                {loadingMessages && (
                  <div className="flex justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-10">
                    Aucun message pour l'instant. Dites bonjour 👋
                  </p>
                )}
                {messages.map((m) => {
                  // Conversation directe (2 participants) : un message m'appartient
                  // ssi il n'est pas de l'autre participant (optimiste '__me__'
                  // inclus — le poll le remplace par mon vrai senderId).
                  const isMine = m.senderId !== selected.participant.id;
                  const pending = m.id.startsWith('pending-');
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                          isMine
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted/70 text-foreground rounded-bl-md'
                        } ${pending ? 'opacity-60' : ''}`}
                      >
                        {m.content}
                        <div
                          className={`mt-0.5 flex items-center justify-end gap-1 text-[9px] ${
                            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}
                        >
                          {formatTime(m.createdAt)}
                          {pending && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          {isMine && !pending && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                className="flex items-end gap-2 p-3 border-t border-border/60"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={Math.min(4, Math.max(1, draft.split('\n').length))}
                  placeholder="Écrire un message…"
                  className="flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 min-h-[42px] max-h-32"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
                  aria-label="Envoyer"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
