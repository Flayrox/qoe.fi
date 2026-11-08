'use client';

// =====================================================================
// 🪟 apps/core/src/features/upcoming/provider.tsx
// =====================================================================
// Monte l'interstitiel unique des fonctionnalités à venir pour le lecteur :
// audio TTS, résumé IA, papiers, hors-ligne, messagerie privée.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  FeatureAnnouncementProvider,
  isFeatureKey,
  type FeatureKey,
  type FeatureSignal,
} from '@qoe/ui';
import { getFeatureCatalogAction, recordFeatureSignalAction } from './actions';

export function FeatureAnnouncements({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const [notified, setNotified] = useState<ReadonlySet<FeatureKey>>(new Set());
  const [notifyEnabled, setNotifyEnabled] = useState<ReadonlySet<FeatureKey> | undefined>();

  useEffect(() => {
    let alive = true;
    getFeatureCatalogAction()
      .then((catalog) => {
        if (!alive) return;
        if (catalog.length === 0) return;
        const enabled = new Set<FeatureKey>();
        const already = new Set<FeatureKey>();
        for (const item of catalog) {
          if (!isFeatureKey(item.key)) continue;
          if (item.notifyEnabled) enabled.add(item.key);
          if (item.notified) already.add(item.key);
        }
        setNotifyEnabled(enabled);
        setNotified((prev) => new Set([...prev, ...already]));
      })
      .catch(() => {
        // Mode dégradé silencieux : le catalogue statique reste la vue de référence
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSignal = useCallback(async (signal: FeatureSignal) => {
    await recordFeatureSignalAction(signal.feature, signal.kind);
  }, []);

  return (
    <FeatureAnnouncementProvider
      locale={locale === 'en' ? 'en' : 'fr'}
      pricingHref="/pricing"
      onSignal={handleSignal}
      notifiedFeatures={notified}
      notifyEnabledFeatures={notifyEnabled}
      onNotified={(feature) =>
        setNotified((prev) => {
          const next = new Set(prev);
          next.add(feature);
          return next;
        })
      }
    >
      {children}
    </FeatureAnnouncementProvider>
  );
}
