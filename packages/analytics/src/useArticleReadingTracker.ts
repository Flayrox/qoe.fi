// =====================================================================
// 📊 Qoe.fi — High-Precision Article Reading & Completion Tracker
// =====================================================================
// Mesure la vraie lecture en combinant :
// 1. Dwell Time Actif (en pause si onglet masqué ou inactivité > 45s)
// 2. Profondeur de Défilement (Scroll Depth %)
// 3. Statut précis : BOUNCE | SKIM (Survol) | READ_PARTIAL | READ_COMPLETE
// 4. Attribution de la Source : feed | subdomain | public_profile | direct
// =====================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { trackEvent } from './client';
import { EVENTS } from './events';
import {
  classifyReadingStatus,
  resolveReadingProvenanceFrom,
  resolveReadingSource,
  type ReadingSource,
  type ReadingStatus,
} from './reading';

export type { ReadingSource, ReadingStatus };

export interface UseArticleReadingTrackerProps {
  articleId: string;
  slug: string;
  readingTimeMinutes?: number;
  initialSource?: ReadingSource;
  endpointUrl?: string;
}

export interface ReadingTrackerState {
  dwellSeconds: number;
  scrollDepthPercent: number;
  status: ReadingStatus;
  isReading: boolean;
  milestonesReached: number[];
  source: ReadingSource;
}

/**
 * 🧭 Résout la provenance fine : hostname du tenant + username du profil référent.
 * - hostname: "victor.qoe.fi" si lu depuis le tenant d'un créateur (sinon null)
 * - referrerUsername: "simone" si ?ref=profile:simone ou /@simone (profil public)
 */
/**
 * 🧭 Résout la provenance fine depuis la page courante.
 * Délègue à `resolveReadingProvenanceFrom` (logique pure, testée).
 */
export function resolveReadingProvenance(): {
  hostname: string | null;
  referrerUsername: string | null;
} {
  if (typeof window === 'undefined') return { hostname: null, referrerUsername: null };

  return resolveReadingProvenanceFrom({
    pathname: window.location.pathname,
    hostname: window.location.hostname,
    search: window.location.search,
  });
}

export function useArticleReadingTracker({
  articleId,
  slug,
  readingTimeMinutes = 5,
  initialSource,
  endpointUrl = '/api/analytics/reading-session',
}: UseArticleReadingTrackerProps): ReadingTrackerState {
  const [dwellSeconds, setDwellSeconds] = useState(0);
  const [scrollDepthPercent, setScrollDepthPercent] = useState(0);
  const [status, setStatus] = useState<ReadingStatus>('BOUNCE');
  const [isReading, setIsReading] = useState(true);
  const [milestonesReached, setMilestonesReached] = useState<number[]>([]);

  // Détection de la source d'entrée
  const sourceRef = useRef<ReadingSource>(initialSource || 'direct');
  const provenanceRef = useRef<{ hostname: string | null; referrerUsername: string | null }>({
    hostname: null,
    referrerUsername: null,
  });
  const dwellSecondsRef = useRef(0);
  const maxScrollRef = useRef(0);
  const milestonesRef = useRef<Set<number>>(new Set());
  const lastActiveTimestampRef = useRef<number>(Date.now());
  const isTabActiveRef = useRef<boolean>(true);
  const isCompleteTriggeredRef = useRef<boolean>(false);
  const reportedRef = useRef<boolean>(false);

  // 1. Résolution de la source + provenance fine au montage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    provenanceRef.current = resolveReadingProvenance();

    sourceRef.current = resolveReadingSource({
      initialSource,
      pathname: window.location.pathname,
      hostname: window.location.hostname,
      search: window.location.search,
    });
  }, [initialSource]);

  // 2. Gestion du Dwell Time actif (Chronomètre intelligent)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      isTabActiveRef.current = document.visibilityState === 'visible';
      if (isTabActiveRef.current) {
        lastActiveTimestampRef.current = Date.now();
        setIsReading(true);
      } else {
        setIsReading(false);
      }
    };

    const handleUserActivity = () => {
      lastActiveTimestampRef.current = Date.now();
      if (isTabActiveRef.current) {
        setIsReading(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('scroll', handleUserActivity, { passive: true });
    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });

    // Tick chaque seconde
    const timer = setInterval(() => {
      if (!isTabActiveRef.current) return;

      const idleDuration = Date.now() - lastActiveTimestampRef.current;
      // Pause si inactif plus de 45 secondes
      if (idleDuration > 45000) {
        setIsReading(false);
        return;
      }

      dwellSecondsRef.current += 1;
      setDwellSeconds(dwellSecondsRef.current);

      // Évaluer le statut en temps réel (même règle que le rapport final)
      const currentStatus = classifyReadingStatus(
        dwellSecondsRef.current,
        maxScrollRef.current,
        readingTimeMinutes
      );

      setStatus(currentStatus);

      // Trigger unique de fin de lecture complète
      if (currentStatus === 'READ_COMPLETE' && !isCompleteTriggeredRef.current) {
        isCompleteTriggeredRef.current = true;
        trackEvent(EVENTS.ARTICLE_COMPLETED, {
          articleId,
          slug,
          source: sourceRef.current,
          dwellSeconds: dwellSecondsRef.current,
          readingTimeMinutes,
        });
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
    };
  }, [articleId, slug, readingTimeMinutes]);

  // 3. Tracking du Scroll Depth (%) et des Milestones
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      const totalScrollable = docHeight - windowHeight;
      if (totalScrollable <= 0) return;

      const currentPercent = Math.min(100, Math.round((scrollTop / totalScrollable) * 100));

      if (currentPercent > maxScrollRef.current) {
        maxScrollRef.current = currentPercent;
        setScrollDepthPercent(currentPercent);

        // Milestones (25%, 50%, 75%, 100%)
        const milestones = [25, 50, 75, 100];
        for (const m of milestones) {
          if (currentPercent >= m && !milestonesRef.current.has(m)) {
            milestonesRef.current.add(m);
            setMilestonesReached(Array.from(milestonesRef.current));
            trackEvent(EVENTS.ARTICLE_READ_MILESTONE, {
              articleId,
              slug,
              milestone: m,
              source: sourceRef.current,
              dwellSeconds: dwellSecondsRef.current,
            });
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [articleId, slug]);

  // 4. Rapport de fin de session au démontage (ou départ de la page)
  useEffect(() => {
    const sendSessionReport = () => {
      if (reportedRef.current) return;

      const finalDwell = dwellSecondsRef.current;
      const finalScroll = maxScrollRef.current;

      // 🛡️ Ignorer les sessions fantômes à 0s / 0% de scroll (montage/démontage React StrictMode)
      if (finalDwell === 0 && finalScroll === 0) {
        return;
      }

      reportedRef.current = true;

      const finalStatus = classifyReadingStatus(finalDwell, finalScroll, readingTimeMinutes);

      // 1. Umami Event
      trackEvent(EVENTS.ARTICLE_READING_SESSION, {
        articleId,
        slug,
        source: sourceRef.current,
        status: finalStatus,
        scrollDepth: finalScroll,
        dwellSeconds: finalDwell,
        readingTimeMinutes,
        hostname: provenanceRef.current.hostname || undefined,
        referrerUsername: provenanceRef.current.referrerUsername || undefined,
      });

      if (finalStatus === 'SKIM') {
        trackEvent(EVENTS.ARTICLE_SKIMMED, {
          articleId,
          slug,
          source: sourceRef.current,
          scrollDepth: finalScroll,
          dwellSeconds: finalDwell,
        });
      }

      // 2. Beacon vers l'API interne pour mise à jour DB & Online Learning
      const payload = JSON.stringify({
        articleId,
        slug,
        source: sourceRef.current,
        status: finalStatus,
        scrollDepth: finalScroll,
        dwellSeconds: finalDwell,
        readingTimeMinutes,
        hostname: provenanceRef.current.hostname,
        referrerUsername: provenanceRef.current.referrerUsername,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpointUrl, payload);
      } else {
        fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', sendSessionReport);
    return () => {
      window.removeEventListener('beforeunload', sendSessionReport);
      sendSessionReport();
    };
  }, [articleId, slug, readingTimeMinutes, endpointUrl]);

  return {
    dwellSeconds,
    scrollDepthPercent,
    status,
    isReading,
    milestonesReached,
    source: sourceRef.current,
  };
}
