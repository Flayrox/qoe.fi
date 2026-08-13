// =====================================================================
// 📊 Client Analytics — Browser side
// =====================================================================
// 📖 Wrapper léger autour de Umami (self-hosted / cloud) avec support multi-tenant.
// =====================================================================

'use client';

import Script from 'next/script';
import { useEffect } from 'react';

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * 📊 Composant script Umami avec support du websiteId dynamic par tenant.
 */
export function AnalyticsScript({ websiteId }: { websiteId?: string }) {
  const targetId = websiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js';

  if (!targetId) return null;

  return <Script defer src={scriptUrl} data-website-id={targetId} strategy="afterInteractive" />;
}

/**
 * 📊 Fonction globale d'envoi d'évènement Umami.
 */
export function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.umami) {
    try {
      window.umami.track(event, data);
    } catch (e) {
      console.warn('Umami tracking failed:', e);
    }
  }
}

/**
 * 📊 Hook pour tracker un event au mount d'un composant.
 */
export function useTrackEvent(event: string, data?: Record<string, unknown>) {
  useEffect(() => {
    trackEvent(event, data);
  }, [event, data]);
}
