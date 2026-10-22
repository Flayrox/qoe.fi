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
import { getFeatureNotifiedAction, recordFeatureSignalAction } from './actions';

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

  useEffect(() => {
    let alive = true;
    getFeatureNotifiedAction()
      .then((keys) => {
        if (!alive) return;
        const known = keys.filter(isFeatureKey);
        if (known.length === 0) return;
        setNotified((prev) => new Set([...prev, ...known]));
      })
      .catch(() => {
        // Best-effort : sans état distant, l'annonce reste utilisable.
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
