// =====================================================================
// 📊 Client Analytics — Browser side
// =====================================================================
// 📖 Wrapper léger autour de Umami (self-hosted) ou autre provider.
//
// 🎯 Usage :
//   trackEvent('signup_completed', { method: 'email' });
// =====================================================================

"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * 📊 Composant à inclure UNE FOIS dans le root layout.
 * Charge le script Umami si configuré.
 */
export function AnalyticsScript() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;

  if (!websiteId) return null;

  return (
    <Script
      defer
      src={scriptUrl || "https://cloud.umami.is/script.js"}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}

/**
 * 📊 Hook pour tracker un event au mount d'un composant.
 */
export function useTrackEvent(event: string, data?: Record<string, unknown>) {
  useEffect(() => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track(event, data);
    }
  }, [event, data]);
}
