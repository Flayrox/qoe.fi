'use client';

// =====================================================================
// 🪟 apps/studio/src/features/upcoming/provider.tsx
// =====================================================================
// Monte l'interstitiel unique des fonctionnalités à venir une seule fois
// pour tout le studio : badges, panneaux verrouillés et boutons « en
// savoir plus » ouvrent tous le même écran, et chaque ouverture alimente
// les statistiques de l'espace actif (créateur ou média).
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  FeatureAnnouncementProvider,
  isFeatureKey,
  type FeatureKey,
  type FeatureSignal,
} from '@qoe/ui';
import {
  getFeatureCatalogAction,
  getFeatureNotifiedAction,
  recordFeatureSignalAction,
} from './actions';

export function FeatureAnnouncements({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  // Demandes déjà enregistrées : lues une fois au montage pour que la
  // promesse survive à un rechargement (l'annonce n'affiche plus
  // « me prévenir » pour une fonctionnalité déjà demandée).
  const [notified, setNotified] = useState<ReadonlySet<FeatureKey>>(new Set());
  // `undefined` = catalogue statique ; sinon l'ensemble exact des promesses
  // ouvertes côté serveur. Un échec réseau ne doit pas masquer tous les CTA.
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
        // Best-effort : sans état distant, le catalogue statique reste la vue.
        // Une promesse déjà enregistrée est relue par le fallback ci-dessous.
        getFeatureNotifiedAction().then((keys) => {
          if (!alive) return;
          const known = keys.filter(isFeatureKey);
          if (known.length > 0) setNotified((prev) => new Set([...prev, ...known]));
        });
      });
    return () => {
      alive = false;
    };
  }, []);

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
