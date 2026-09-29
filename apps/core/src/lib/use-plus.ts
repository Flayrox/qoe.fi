'use client';

import { useEffect, useState } from 'react';
import { fetchPlusStatus } from './plus-status';

// =====================================================================
// 🎫 usePlus — binding React fin au-dessus de fetchPlusStatus (testé).
// =====================================================================
// null = chargement (les gates affichent l'état neutre en attendant, jamais
// de flash d'upsell) ; false = gratuit (upsell informatif, pas de vente de
// vent — pas de checkout).
// =====================================================================

export function usePlus(): boolean | null {
  const [plus, setPlus] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPlusStatus().then((v) => {
      if (alive) setPlus(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return plus;
}
