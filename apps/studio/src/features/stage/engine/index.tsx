// =====================================================================
// 🔌 StageEditorProvider — boundary client mobx (pattern Onlook index.tsx:8-74)
// =====================================================================

'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { StageEditorEngine } from './stage-editor-engine';

const StageEditorContext = createContext<StageEditorEngine | null>(null);

export function StageEditorProvider({ children }: { children: React.ReactNode }) {
  const [engine] = useState(() => new StageEditorEngine());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear différé (aucun setState pendant le démontage), mais **annulable** :
    // sous StrictMode, React démonte puis remonte l'effet, et le timer du
    // premier démontage effaçait sinon sélection, rects et historique du
    // moteur vivant juste après le remontage.
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    return () => {
      clearTimer.current = setTimeout(() => {
        clearTimer.current = null;
        engine.clear();
      }, 0);
    };
  }, [engine]);

  return <StageEditorContext.Provider value={engine}>{children}</StageEditorContext.Provider>;
}

export function useStageEditorEngine(): StageEditorEngine {
  const ctx = useContext(StageEditorContext);
  if (!ctx) throw new Error('useStageEditorEngine must be used within StageEditorProvider');
  return ctx;
}

// Alias de compatibilité directe avec les fichiers portés d'Onlook :
// `import { useEditorEngine } from '@/components/store/editor'` → ce shim.
export const useEditorEngine = useStageEditorEngine;
