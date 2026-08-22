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

export type ReadingSource = 'feed' | 'subdomain' | 'public_profile' | 'direct';
export type ReadingStatus = 'BOUNCE' | 'SKIM' | 'READ_PARTIAL' | 'READ_COMPLETE';

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
  const dwellSecondsRef = useRef(0);
  const maxScrollRef = useRef(0);
  const milestonesRef = useRef<Set<number>>(new Set());
  const lastActiveTimestampRef = useRef<number>(Date.now());
  const isTabActiveRef = useRef<boolean>(true);
  const isCompleteTriggeredRef = useRef<boolean>(false);

  // 1. Résolution de la source au montage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (initialSource) {
      sourceRef.current = initialSource;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref') || params.get('source');

    if (refParam === 'feed' || window.location.pathname.startsWith('/home')) {
      sourceRef.current = 'feed';
    } else if (refParam === 'profile' || refParam === 'author') {
      sourceRef.current = 'public_profile';
    } else {
      const hostname = window.location.hostname;
      const isSubdomain =
        hostname.includes('.qoe.fi') &&
        !hostname.startsWith('core.') &&
        !hostname.startsWith('www.');
      if (isSubdomain) {
        sourceRef.current = 'subdomain';
      } else {
        sourceRef.current = 'direct';
      }
    }
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

      // Évaluer le statut en temps réel
      const expectedSeconds = readingTimeMinutes * 60;
      const minReadingTime = expectedSeconds * 0.35; // 35% du temps estimé
      const scroll = maxScrollRef.current;

      let currentStatus: ReadingStatus = 'BOUNCE';
      if (dwellSecondsRef.current < 10 && scroll < 25) {
        currentStatus = 'BOUNCE';
      } else if (scroll >= 80 && dwellSecondsRef.current < minReadingTime) {
        currentStatus = 'SKIM'; // Survol rapide
      } else if (scroll >= 85 && dwellSecondsRef.current >= minReadingTime) {
        currentStatus = 'READ_COMPLETE'; // Vraie lecture complète certifiée
      } else if (scroll >= 25) {
        currentStatus = 'READ_PARTIAL';
      }

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
      const finalDwell = dwellSecondsRef.current;
      const finalScroll = maxScrollRef.current;
      const expectedSeconds = readingTimeMinutes * 60;
      const minReadingTime = expectedSeconds * 0.35;

      let finalStatus: ReadingStatus = 'BOUNCE';
      if (finalDwell < 10 && finalScroll < 25) {
        finalStatus = 'BOUNCE';
      } else if (finalScroll >= 80 && finalDwell < minReadingTime) {
        finalStatus = 'SKIM';
      } else if (finalScroll >= 85 && finalDwell >= minReadingTime) {
        finalStatus = 'READ_COMPLETE';
      } else if (finalScroll >= 25) {
        finalStatus = 'READ_PARTIAL';
      }

      // 1. Umami Event
      trackEvent(EVENTS.ARTICLE_READING_SESSION, {
        articleId,
        slug,
        source: sourceRef.current,
        status: finalStatus,
        scrollDepth: finalScroll,
        dwellSeconds: finalDwell,
        readingTimeMinutes,
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
