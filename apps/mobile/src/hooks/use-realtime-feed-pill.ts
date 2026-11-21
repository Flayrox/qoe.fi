import { useCallback, useEffect, useRef, useState } from 'react';

import { feedSliceId, pickNewSlices } from '@/features/feed/feed-pill';
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
    // Une pensée est « nouvelle » si son target n'est ni visible ni déjà en buffer.
    const known = [...visibleRef.current, ...unreadRef.current.map(feedSliceId)];
    const fresh = pickNewSlices(slices, known);
    if (fresh.length > 0) {
      unreadRef.current = [...fresh, ...unreadRef.current];
      setUnread(unreadRef.current);
    }
  }, []);

  /**
   * Vide le buffer et RETOURNE ses tranches : l'appelant les garde affichées
   * en tête de liste (sinon elles disparaîtraient au tap sur la pill, le feed
   * paginé en cache ne les contenant pas encore).
   */
  const flush = useCallback((): FeedSlice[] => {
    const flushed = unreadRef.current;
    unreadRef.current = [];
    setUnread([]);
    return flushed;
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
