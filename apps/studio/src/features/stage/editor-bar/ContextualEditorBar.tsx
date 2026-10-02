// =====================================================================
// ⚡ ContextualEditorBar.tsx — Barre d'Outils Flottante Contextuelle (Adaptée d'Onlook)
// =====================================================================

'use client';

import React from 'react';
import { Copy, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';

export function ContextualEditorBar() {
  const engine = useStageEngine();
  const selected = engine.selectedBlock;

  if (!selected || engine.editorMode === StageEditorMode.PREVIEW) {
    return null;
  }

  const props = (selected.props || {}) as Record<string, unknown>;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 select-none">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
          className="flex items-center gap-1 p-1 bg-background/95 backdrop-blur-2xl border border-border/70 rounded-xl shadow-2xl text-xs"
        >
          {/* Badge d'identification du composant */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-foreground font-semibold">
            <span className="text-primary font-mono">◇</span>
            <span className="capitalize">{selected.type.replace('-', ' ')}</span>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1" />

          {/* Contrôle contextuel rapide selon le type de bloc */}
          {selected.type === 'hero' && (
            <div className="flex items-center gap-1">
              <select
                value={(props.style as string) || 'cinematic-banner'}
                onChange={(e) => engine.updateBlockProps(selected.id, { style: e.target.value })}
                className="bg-muted/60 border border-border/40 rounded-lg px-2 py-1 text-foreground text-[11px] font-medium cursor-pointer"
              >
                <option value="cinematic-banner">Bannière</option>
                <option value="typographic-minimal">Typographique</option>
                <option value="split-featured">Deux Colonnes</option>
                <option value="floating-card">Carte Flottante</option>
              </select>
            </div>
          )}

          {selected.type === 'bento-grid' && (
            <div className="flex items-center gap-1">
              {[2, 3].map((cols) => (
                <button
                  key={cols}
                  type="button"
                  onClick={() => engine.updateBlockProps(selected.id, { columns: cols })}
                  className={`px-2 py-1 rounded-lg font-medium text-[11px] transition-colors ${
                    (props.columns || 3) === cols
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {cols} Cols
                </button>
              ))}
            </div>
          )}

          {selected.type === 'article-stream' && (
            <div className="flex items-center gap-1">
              <select
                value={(props.displayMode as string) || 'grid-3'}
                onChange={(e) =>
                  engine.updateBlockProps(selected.id, { displayMode: e.target.value })
                }
                className="bg-muted/60 border border-border/40 rounded-lg px-2 py-1 text-foreground text-[11px] font-medium cursor-pointer"
              >
                <option value="list">Lignes</option>
                <option value="grid-2">Grille 2</option>
                <option value="grid-3">Grille 3</option>
              </select>
            </div>
          )}

          <div className="h-4 w-px bg-border/60 mx-1" />

          {/* Actions Hiérarchiques : Déplacement, Duplication, Visibilité, Suppression */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => engine.moveBlock(selected.id, 'up')}
              title="Monter la section (⌥↑)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => engine.moveBlock(selected.id, 'down')}
              title="Descendre la section (⌥↓)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => engine.duplicateBlock(selected.id)}
              title="Dupliquer le bloc (⌘D)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => engine.toggleVisibility(selected.id)}
              title={selected.visible ? 'Masquer' : 'Afficher'}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              {selected.visible ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-destructive" />
              )}
            </button>
            <button
              type="button"
              onClick={() => engine.deleteBlock(selected.id)}
              title="Supprimer (⌫)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
