// =====================================================================
// 📊 Client Analytics — Browser side
// =====================================================================
// 📖 Wrapper léger autour de Umami (self-hosted / cloud) avec support multi-tenant.
//
// Mode « exempté » (défaut) : le traceur est chargé sans lire ni écrire quoi
// que ce soit sur le terminal (aucun cookie, aucun localStorage), l'adresse IP
// est anonymisée côté serveur avant tout enregistrement, les paramètres de
// requête et les fragments d'URL ne sont pas collectés, et le réglage « Do Not
// Track » du navigateur est respecté. C'est ce faisceau de garanties qui
// dispense de consentement — il n'est donc pas optionnel : chaque attribut
// ci-dessous est une pièce de la justification, pas une préférence esthétique.
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

interface AnalyticsScriptProps {
  websiteId?: string;
  /**
   * `false` = régime avec consentement préalable (bannière). Dans ce cas on
   * n'ajoute pas `data-do-not-track`, car le choix de la personne primerait
   * sur le réglage global du navigateur.
   */
  exempt?: boolean;
}

/**
 * 📊 Composant script Umami avec support du websiteId dynamic par tenant.
 */
export function AnalyticsScript({ websiteId, exempt = true }: AnalyticsScriptProps) {
  const targetId = websiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js';

  if (!targetId) return null;

  return (
    <Script
      defer
      src={scriptUrl}
      data-website-id={targetId}
      // 🔒 Rien de ce qui pourrait identifier une personne ne quitte le poste :
      // ni paramètres de recherche (ils contiennent souvent des jetons ou des
      // adresses e-mail), ni fragments d'URL.
      data-exclude-search="true"
      data-exclude-hash="true"
      data-do-not-track={exempt ? 'true' : undefined}
      strategy="afterInteractive"
    />
  );
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

/**
 * 🚫 Éteint (ou rallume) la mesure d'audience dans ce navigateur. C'est le
 * mécanisme d'opposition : Umami lit `umami.disabled` dans le stockage local
 * avant chaque envoi. Aucune donnée n'est alors transmise, même si le script
 * reste chargé.
 */
export function setAnalyticsDisabled(disabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (disabled) {
      window.localStorage.setItem('umami.disabled', 'true');
    } else {
      window.localStorage.removeItem('umami.disabled');
    }
  } catch {
    // Stockage indisponible (mode privé) : le serveur ne sert pas le script
    // du tout quand une opposition est enregistrée côté cookie.
  }
}

/** 🔎 La mesure d'audience est-elle coupée dans ce navigateur ? */
export function isAnalyticsDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('umami.disabled') === 'true';
  } catch {
    return false;
  }
}
