'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { createClient as createSupabaseClient } from '@qoe/supabase';

const COLLAB_URL = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_COLLAB_URL : undefined;

const CURSOR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

export type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseCollaborationSessionOptions {
  enabled?: boolean;
  roomId?: string;
}

/**
 * Jeton d'accès Supabase prêt à l'emploi.
 *
 * `getSession()` renvoie la session **telle qu'elle est stockée** : si son
 * jeton a expiré (une heure, et la session est rafraîchie côté serveur par le
 * middleware), on envoyait un jeton mort au serveur de collaboration, qui
 * refusait chaque connexion — d'où la boucle « token invalide ». On rafraîchit
 * donc avant de connecter.
 */
async function getAccessToken(): Promise<string> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (session && (!session.expires_at || session.expires_at - 60 > nowSeconds)) {
    return session.access_token;
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? session?.access_token ?? '';
}

export function useCollaborationSession({
  enabled = true,
  roomId,
}: UseCollaborationSessionOptions) {
  const collaborationDoc = useMemo(
    () => (enabled && roomId && COLLAB_URL && typeof window !== 'undefined' ? new Y.Doc() : null),
    [enabled, roomId]
  );

  const collaborationProvider = useMemo(
    () =>
      collaborationDoc && roomId && COLLAB_URL
        ? new HocuspocusProvider({
            url: COLLAB_URL,
            name: `article:${roomId}`,
            document: collaborationDoc,
            // JWT Supabase de la session courante — validé côté serveur.
            token: () => getAccessToken(),
          })
        : null,
    [collaborationDoc, roomId]
  );

  const [collabUser, setCollabUser] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Même précaution que pour la connexion : on lit un jeton frais, donc
      // une session utilisable.
      const token = await getAccessToken();
      if (!token) return;
      const session = await createSupabaseClient().auth.getSession();
      const user = session.data.session?.user;
      if (cancelled || !user) return;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.name === 'string' && meta.name) ||
        (typeof meta.full_name === 'string' && meta.full_name) ||
        user.email?.split('@')[0] ||
        'Éditeur';
      setCollabUser({ name, color: colorForUserId(user.id) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [peerCount, setPeerCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<CollaborationStatus>(
    collaborationProvider ? 'connecting' : 'idle'
  );
  const [synced, setSynced] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const provider = collaborationProvider;
    if (!provider) return;

    const handleAwareness = () => {
      const states = provider.awareness?.getStates() ?? new Map();
      let editors = 0;
      states.forEach((state) => {
        const s = state as { user?: unknown };
        if (s?.user) editors += 1;
      });
      setPeerCount(Math.max(0, editors - 1));
    };
    const handleStatus = ({
      status: next,
    }: {
      status: 'connecting' | 'connected' | 'disconnected';
    }) => {
      setConnected(next === 'connected');
      setStatus(next);
      if (next !== 'connected') setPeerCount(0);
      if (next === 'connected') setLastError(null);
    };
    const handleSynced = ({ state }: { state: boolean }) => {
      setSynced(state);
      if (state) setUnsyncedChanges(0);
    };
    const handleUnsynced = ({ number }: { number: number }) => {
      setUnsyncedChanges(Math.max(0, number));
    };
    const handleAuthFailed = ({ reason }: { reason: string }) => {
      setStatus('error');
      setConnected(false);
      setSynced(false);
      setLastError(reason || 'Authentification de la co-édition refusée');
    };
    const handleDisconnect = () => {
      // Un échec d'authentification est plus précis qu'une simple coupure :
      // ne l'écrase pas avec « hors ligne ».
      setStatus((current) => (current === 'error' ? current : 'disconnected'));
      setConnected(false);
      setSynced(false);
      setPeerCount(0);
    };

    provider.awareness?.on('change', handleAwareness);
    provider.on('status', handleStatus);
    provider.on('synced', handleSynced);
    provider.on('unsyncedChanges', handleUnsynced);
    provider.on('authenticationFailed', handleAuthFailed);
    provider.on('disconnect', handleDisconnect);
    handleAwareness();
    return () => {
      provider.awareness?.off('change', handleAwareness);
      provider.off('status', handleStatus);
      provider.off('synced', handleSynced);
      provider.off('unsyncedChanges', handleUnsynced);
      provider.off('authenticationFailed', handleAuthFailed);
      provider.off('disconnect', handleDisconnect);
    };
  }, [collaborationProvider]);

  const reconnect = useCallback(() => {
    if (!collaborationProvider) return;
    setLastError(null);
    setStatus('connecting');
    collaborationProvider.disconnect();
    void collaborationProvider.connect();
  }, [collaborationProvider]);

  useEffect(() => () => collaborationProvider?.destroy(), [collaborationProvider]);

  return {
    collaborationDoc,
    collaborationProvider,
    collabUser,
    peerCount,
    connected,
    status,
    synced,
    unsyncedChanges,
    lastError,
    reconnect,
  };
}
