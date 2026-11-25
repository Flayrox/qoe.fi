// =====================================================================
// BottomBar.tsx — Dock inférieur de Qoefi Stage
// =====================================================================

'use client';

import React from 'react';
import { MousePointer, Hand, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';

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
            className="flex items-center gap-1 p-1 bg-background/90 backdrop-blur-md border border-border/60 rounded-lg shadow-md text-xs"
          >
            {/* Outil Sélection (V) */}
            <Button
              variant="solid"
              tone="brand"
              type="button"
              onClick={() => engine.setEditorMode(StageEditorMode.DESIGN)}
              title={t`Sélectionner (V)`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium! transition-all ${
                engine.editorMode === StageEditorMode.DESIGN
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              } h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal `}
            >
              <MousePointer className="w-3.5! h-3.5!" />
              <span>{t`Sélection`}</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded text-[10px] bg-background/20 font-mono">
                V
              </kbd>
            </Button>

            {/* Outil Main / Pan (H) */}
            <Button
              variant="solid"
              tone="brand"
              type="button"
              onClick={() => engine.setEditorMode(StageEditorMode.PAN)}
              title={t`Main panoramique (H)`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium! transition-all ${
                engine.editorMode === StageEditorMode.PAN
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              } h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal `}
            >
              <Hand className="w-3.5! h-3.5!" />
              <span>{t`Pan`}</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded text-[10px] bg-background/20 font-mono">
                H
              </kbd>
            </Button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            {/* Bouton Ajouter Section Rapide */}
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                engine.setLeftPanelTab('blocks');
                engine.setLeftPanelLocked(true);
              }}
              title={t`Ajouter un bloc`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium! text-foreground hover:bg-muted/60 transition-colors h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
            >
              <Plus className="w-3.5! h-3.5!" />
              <span>{t`Ajouter`}</span>
            </Button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            {/* Zoom rapide & Recentrage */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                type="button"
                onClick={engine.zoomOut}
                title={t`Zoom arrière (⌘-)`}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <ZoomOut className="w-3.5! h-3.5!" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                type="button"
                onClick={engine.resetZoom}
                title={t`Recentrer le plan de travail (⇧0)`}
                className="hover:bg-transparent px-1.5 py-0.5 font-mono text-[11px]! font-semibold! text-foreground/80 hover:text-foreground h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block "
              >
                {Math.round(engine.scale * 100)}%
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={engine.zoomIn}
                title={t`Zoom avant (⌘+)`}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <ZoomIn className="w-3.5! h-3.5!" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
