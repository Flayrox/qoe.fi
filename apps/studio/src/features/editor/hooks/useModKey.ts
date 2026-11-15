'use client';

import React from 'react';

/**
 * Touche de commande affichée dans l'interface (`⌘` sur Apple, `Ctrl` ailleurs).
 *
 * La valeur est résolue après le montage : le HTML serveur et le premier rendu
 * client restent identiques, sinon les `aria-label` divergent et React signale
 * une erreur d'hydratation.
 */
export function useModKey(): string {
  const [mod, setMod] = React.useState('Ctrl');

  React.useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
      setMod('⌘');
    }
  }, []);

  return mod;
}
