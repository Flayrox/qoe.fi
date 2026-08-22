// =====================================================================
// 👁️ useFeedImpressionTracker — Impressions du feed (IntersectionObserver)
// =====================================================================
// Fire-once par montage : l'item entre à ≥50% dans le viewport → 1 impression.
// Batché côté FeedDashboard (les items s'enregistrent dans un buffer partagé,
// flush toutes les 3s ou à 10 items) pour ne pas spammer le réseau.
// =====================================================================

'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from './client';
import { EVENTS } from './events';

export interface FeedImpressionItem {
  itemType: 'ARTICLE' | 'THOUGHT';
  itemId: string;
  position: number;
  isDiscovery?: boolean;
}

// ── Buffer partagé (module-level) : batch les impressions entre items ──
const IMPRESSION_BUFFER_LIMIT = 10;
const FLUSH_INTERVAL_MS = 3000;
const ENDPOINT = '/api/analytics/feed-impression';
const SEEN_KEY = 'qoe_feed_impressions_seen';
const SEEN_TTL_MS = 5 * 60 * 1000; // re-fire autorisé après 5 min (nouvelle session de scroll)

interface BufferedImpression extends FeedImpressionItem {
  bufferedAt: number;
}

const buffer: BufferedImpression[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function loadSeen(): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const map = new Map<string, number>();
    for (const [k, v] of Object.entries(parsed)) {
      if (now - v < SEEN_TTL_MS) map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveSeen(seen: Map<string, number>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(seen)));
  } catch {}
}

function flushBuffer() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);

  // Umami event agrégé (compteur)
  trackEvent(EVENTS.FEED_IMPRESSION, { count: batch.length });

  const payload = JSON.stringify({ items: batch });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, payload);
  } else {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

/**
 * 👁️ Track une impression feed (fire-once par item / 5min, batch réseau).
 * Retourne un ref à attacher au conteneur de la carte.
 */
export function useFeedImpressionTracker(item: FeedImpressionItem) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  const seenMapRef = useRef<Map<string, number> | null>(null);
  const itemKey = `${item.itemType}:${item.itemId}`;

  useEffect(() => {
    if (firedRef.current) return;
    if (!seenMapRef.current) seenMapRef.current = loadSeen();
    const seen = seenMapRef.current;
    const lastSeenAt = seen.get(itemKey);
    if (lastSeenAt && Date.now() - lastSeenAt < SEEN_TTL_MS) return;

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || firedRef.current) continue;
          firedRef.current = true;
          observer.disconnect();

          seen.set(itemKey, Date.now());
          saveSeen(seen);

          buffer.push({ ...item, bufferedAt: Date.now() });
          if (buffer.length >= IMPRESSION_BUFFER_LIMIT) {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            flushBuffer();
          } else {
            scheduleFlush();
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [itemKey]);

  return ref;
}
