'use client';

// =====================================================================
// 🧵 Contexte de la surcouche de pensée
// =====================================================================
// 📖 Le contexte vit dans son propre module : le provider importe le fil
//    (ThoughtThreadView), et le fil a besoin du hook pour ouvrir une pensée
//    citée. Les mettre dans le même fichier créait un cycle d'imports entre
//    le provider et les composants de thread.
// =====================================================================

import React from 'react';

export interface ThoughtOverlayApi {
  openThought: (postId: string, authorHandle?: string) => void;
  closeThought: () => void;
  isOpen: boolean;
  activePostId: string | null;
}

export const ThoughtOverlayContext = React.createContext<ThoughtOverlayApi | null>(null);

/**
 * API de la surcouche de pensée. `null` hors provider : une carte rendue
 * isolément retombe sur une navigation classique au lieu de planter.
 */
export function useThoughtOverlay(): ThoughtOverlayApi | null {
  return React.useContext(ThoughtOverlayContext);
}
