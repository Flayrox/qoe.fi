'use client';

// =====================================================================
// 🪟 apps/studio/src/features/upcoming/provider.tsx
// =====================================================================
// Monte l'interstitiel unique des fonctionnalités à venir une seule fois
// pour tout le studio : badges, panneaux verrouillés et boutons « en
// savoir plus » ouvrent tous le même écran, et chaque ouverture alimente
// les statistiques de l'espace actif (créateur ou média).
// =====================================================================

import React, { useCallback } from 'react';
import { FeatureAnnouncementProvider, type FeatureSignal } from '@qoe/ui';
import { recordFeatureSignalAction } from './actions';

export function FeatureAnnouncements({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  // Signaux : une requête courte et idempotente. Une erreur ne remonte pas
  // en toast — le bouton « me prévenir » affiche son propre état d'échec.
  const handleSignal = useCallback(async (signal: FeatureSignal) => {
    await recordFeatureSignalAction(signal.feature, signal.kind);
  }, []);

  return (
    <FeatureAnnouncementProvider
      locale={locale === 'en' ? 'en' : 'fr'}
      pricingHref="/pricing"
      onSignal={handleSignal}
    >
      {children}
    </FeatureAnnouncementProvider>
  );
}
