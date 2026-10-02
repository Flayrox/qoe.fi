// =====================================================================
// ⚓ BottomBar.tsx — Dock Flottant Inférieur de Qoefi Stage (Adapté d'Onlook)
// =====================================================================

'use client';

import React from 'react';
import { MousePointer, Hand, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';

export function BottomBar() {
  const engine = useStageEngine();
  const shouldShow = engine.editorMode !== StageEditorMode.PREVIEW;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-4 select-none z-40">
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className="flex items-center gap-1 p-1 bg-background/90 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl text-xs"
          >
            {/* Outil Sélection (V) */}
            <button
              type="button"
              onClick={() => engine.setEditorMode(StageEditorMode.DESIGN)}
              title="Sélectionner (V)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                engine.editorMode === StageEditorMode.DESIGN
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Sélection</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded text-[10px] bg-background/20 font-mono">
                V
              </kbd>
            </button>

            {/* Outil Main / Pan (H) */}
            <button
              type="button"
              onClick={() => engine.setEditorMode(StageEditorMode.PAN)}
              title="Main panoramique (H)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                engine.editorMode === StageEditorMode.PAN
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Pan</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded text-[10px] bg-background/20 font-mono">
                H
              </kbd>
            </button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            {/* Bouton Ajouter Section Rapide */}
            <button
              type="button"
              onClick={() => {
                engine.setLeftPanelTab('blocks');
                engine.setLeftPanelLocked(true);
              }}
              title="Ajouter un bloc"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>Ajouter</span>
            </button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            {/* Zoom rapide & Recentrage */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={engine.zoomOut}
                title="Zoom arrière (⌘-)"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={engine.resetZoom}
                title="Recentrer le plan de travail (⇧0)"
                className="px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground/80 hover:text-foreground"
              >
                {Math.round(engine.scale * 100)}%
              </button>
              <button
                type="button"
                onClick={engine.zoomIn}
                title="Zoom avant (⌘+)"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
