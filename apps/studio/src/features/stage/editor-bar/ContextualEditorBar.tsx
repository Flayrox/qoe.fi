// =====================================================================
// ⚡ ContextualEditorBar.tsx — barre contextuelle Figma-grade souveraine
// Portée d'Onlook editor-bar/{div,text,frame}-selected + toolbar/overflow.
// CSS fin (style BlockStyleProps) + Contenu métier + actions hiérarchiques.
// =====================================================================

'use client';

import React, { useState } from 'react';
import { Copy, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';
import {
  BackgroundControl,
  BorderControl,
  DimensionControl,
  DisplayControl,
  MarginControl,
  OpacityControl,
  PaddingControl,
  RadiusControl,
} from './controls/dropdowns';
import { AdvancedTypoControls, FontControls } from './controls/text-controls';

type PanelTab = 'style' | 'text' | 'content' | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-medium"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="space-y-2 border-t border-border/40 p-2">{children}</div>}
    </div>
  );
}

export function ContextualEditorBar() {
  const engine = useStageEngine();
  const selected = engine.selectedBlock;
  const [panel, setPanel] = useState<PanelTab>(null);

  if (!selected || engine.editorMode === StageEditorMode.PREVIEW) {
    return null;
  }

  const props = (selected.props || {}) as Record<string, unknown>;

  return (
    <div className="absolute top-14 left-1/2 z-40 -translate-x-1/2 select-none">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
          className="flex max-w-[min(92vw,720px)] flex-col rounded-xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-center gap-1 p-1 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 font-semibold text-foreground">
              <span className="font-mono text-primary">◇</span>
              <span className="capitalize">{selected.type.replace('-', ' ')}</span>
            </div>
            <div className="mx-1 h-4 w-px bg-border/60" />
            {(['style', 'text', 'content'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPanel((p) => (p === t ? null : t))}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  panel === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                {t === 'style' ? 'Style' : t === 'text' ? 'Texte' : 'Contenu'}
              </button>
            ))}
            <div className="mx-1 h-4 w-px bg-border/60" />
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => engine.moveBlock(selected.id, 'up')}
                title="Monter (⌥↑)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => engine.moveBlock(selected.id, 'down')}
                title="Descendre (⌥↓)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => engine.duplicateBlock(selected.id)}
                title="Dupliquer (⌘D)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => engine.toggleVisibility(selected.id)}
                title={selected.visible ? 'Masquer' : 'Afficher'}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {selected.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-destructive" />
                )}
              </button>
              <button
                type="button"
                onClick={() => engine.deleteBlock(selected.id)}
                title="Supprimer (⌫)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {panel && (
            <div className="max-h-[50vh] w-[380px] space-y-1.5 overflow-y-auto border-t border-border/50 p-2">
              {panel === 'style' && (
                <>
                  <Section title="Fond">
                    <BackgroundControl />
                  </Section>
                  <Section title="Bordure + Rayon">
                    <BorderControl />
                    <RadiusControl />
                  </Section>
                  <Section title="Disposition Flex">
                    <DisplayControl />
                  </Section>
                  <Section title="Marges">
                    <PaddingControl />
                    <MarginControl />
                  </Section>
                  <Section title="Dimensions + Opacité">
                    <DimensionControl />
                    <OpacityControl />
                  </Section>
                </>
              )}
              {panel === 'text' && (
                <>
                  <Section title="Police">
                    <FontControls />
                  </Section>
                  <Section title="Typographie avancée">
                    <AdvancedTypoControls />
                  </Section>
                </>
              )}
              {panel === 'content' && (
                <div className="space-y-2">
                  {selected.type === 'hero' && (
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Variante visuelle
                      </span>
                      <select
                        value={(props.style as string) || 'cinematic-banner'}
                        onChange={(e) =>
                          engine.updateBlockProps(selected.id, { style: e.target.value })
                        }
                        className="w-full cursor-pointer rounded-lg border border-border/40 bg-muted/60 px-2 py-1 text-[11px] font-medium text-foreground"
                      >
                        <option value="cinematic-banner">Bannière</option>
                        <option value="typographic-minimal">Typographique</option>
                        <option value="split-featured">Deux Colonnes</option>
                        <option value="floating-card">Carte Flottante</option>
                      </select>
                    </label>
                  )}
                  {selected.type === 'bento-grid' && (
                    <div className="flex items-center gap-1">
                      {[2, 3].map((cols) => (
                        <button
                          key={cols}
                          type="button"
                          onClick={() => engine.updateBlockProps(selected.id, { columns: cols })}
                          className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
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
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Présentation
                      </span>
                      <select
                        value={(props.displayMode as string) || 'grid-3'}
                        onChange={(e) =>
                          engine.updateBlockProps(selected.id, { displayMode: e.target.value })
                        }
                        className="w-full cursor-pointer rounded-lg border border-border/40 bg-muted/60 px-2 py-1 text-[11px] font-medium text-foreground"
                      >
                        <option value="list">Lignes</option>
                        <option value="grid-2">Grille 2</option>
                        <option value="grid-3">Grille 3</option>
                      </select>
                    </label>
                  )}
                  {(selected.type === 'navbar' ||
                    selected.type === 'footer' ||
                    selected.type === 'lead-story') && (
                    <p className="rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                      Contenu métier dans l&apos;inspecteur droit. Le style fin (fond, bordure,
                      espacements, typo) se règle ici.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
