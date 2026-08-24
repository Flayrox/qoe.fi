import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api';
import type { FeedSlice } from '@qoe/sdk/mobile';

// =====================================================================
// 🔴 useRealtimeFeedPill — Pill « X nouvelles pensées » (feed mobile)
// =====================================================================
// Le mobile parle directement à l'API Go (pas de Supabase Realtime comme le
// web) : on utilise donc un **polling léger** toutes les `intervalMs` pour
// détecter les nouvelles pensées (FeedSlice dont l'id n'est pas dans la
// liste visible). Les nouvelles pensées sont mises en buffer (`unread`),
// affichées via une pill, et insérées en tête de liste à la demande
// (`flush`). Le polling se suspend quand le buffer est plein et reprend
// après flush.
// =====================================================================

export function useRealtimeFeedPill({
  enabled = true,
  visibleIds,
  intervalMs = 20000,
}: {
  enabled?: boolean;
  /** Ids (targetPost) actuellement visibles dans le feed — pour détecter le « nouveau ». */
  visibleIds: string[];
  intervalMs?: number;
}) {
  const [unread, setUnread] = useState<FeedSlice[]>([]);
  const visibleRef = useRef<Set<string>>(new Set(visibleIds));
  const unreadRef = useRef<FeedSlice[]>([]);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    visibleRef.current = new Set(visibleIds);
  }, [visibleIds]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const adopt = useCallback((slices: FeedSlice[]) => {
    const fresh: FeedSlice[] = [];
    for (const slice of slices) {
      // Une pensée est « nouvelle » si son target n'est ni visible ni déjà en buffer.
      const id = slice.targetPost?.id || slice.id;
      if (visibleRef.current.has(id)) continue;
      if (unreadRef.current.some((u) => (u.targetPost?.id || u.id) === id)) continue;
      fresh.push(slice);
    }
    if (fresh.length > 0) {
      unreadRef.current = [...fresh, ...unreadRef.current];
      setUnread(unreadRef.current);
    }
  }, []);

  const flush = useCallback(() => {
    unreadRef.current = [];
    setUnread([]);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled || !enabledRef.current) return;
      // Buffer plein → on suspend le polling jusqu'au flush.
      if (unreadRef.current.length >= 20) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      try {
        const res = await apiClient.getFeed({ limit: 10 });
        if (res.ok && !cancelled) {
          adopt(res.data.items);
        }
      } catch {
        // réseau coupé → on réessaie plus tard, sans crasher.
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs, adopt]);

  return { unread, unreadCount: unread.length, flush };
}
