// =====================================================================
// 🔌 StageEditorProvider — boundary client mobx (pattern Onlook index.tsx:8-74)
// =====================================================================

'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { StageEditorEngine } from './stage-editor-engine';

const StageEditorContext = createContext<StageEditorEngine | null>(null);

export function StageEditorProvider({ children }: { children: React.ReactNode }) {
  const [engine] = useState(() => new StageEditorEngine());

  useEffect(() => {
    // Cleanup async comme Onlook (évite setState pendant unmount StrictMode)
    return () => {
      const timer = setTimeout(() => engine.clear(), 0);
      // Note: le timer court après unmount, on le laisse se terminer ;
      // pas de clearTimeout ici pour garantir le clear différé.
      void timer;
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
