'use client';

import { useEffect, useState } from 'react';
import { isStaleServerActionError } from '@qoe/utils';

// =====================================================================
// 🛰️ StaleServerActionBanner — sessions ouvertes pendant un déploiement
// =====================================================================
// Le JS en cache peut appeler une Server Action d'un build précédent. Next
// répond alors « Failed to find Server Action » : au lieu de laisser le clic
// échouer silencieusement, on propose explicitement le rechargement vers le
// build courant.
// =====================================================================

export function StaleServerActionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showIfStale = (value: unknown) => {
      if (isStaleServerActionError(value)) {
        setVisible(true);
      }
    };
    const onError = (event: ErrorEvent) => {
      showIfStale(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      showIfStale(event.reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-border bg-background p-4 shadow-xl"
    >
      <p className="text-sm font-semibold">Une nouvelle version est disponible</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Cette page utilise encore l’ancienne version. Rechargez pour continuer sans erreur.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Recharger
      </button>
    </div>
  );
}
