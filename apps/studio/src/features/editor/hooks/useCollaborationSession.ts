'use client';

import { useEffect, useMemo, useState } from 'react';
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

interface UseCollaborationSessionOptions {
  enabled?: boolean;
  roomId?: string;
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
            token: async () => {
              const session = await createSupabaseClient().auth.getSession();
              return session.data.session?.access_token ?? '';
            },
          })
        : null,
    [collaborationDoc, roomId]
  );

  const [collabUser, setCollabUser] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    const handleStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setConnected(status === 'connected');
      if (status !== 'connected') setPeerCount(0);
    };

    provider.awareness?.on('change', handleAwareness);
    provider.on('status', handleStatus);
    handleAwareness();
    return () => {
      provider.awareness?.off('change', handleAwareness);
      provider.off('status', handleStatus);
    };
  }, [collaborationProvider]);

  useEffect(() => () => collaborationProvider?.destroy(), [collaborationProvider]);

  return {
    collaborationDoc,
    collaborationProvider,
    collabUser,
    peerCount,
    connected,
  };
}
