// =====================================================================
// ContextualEditorBar.tsx — barre d'outils contextuelle
// Portée d'Onlook editor-bar/{div,text,frame}-selected + toolbar/overflow.
// CSS fin (style BlockStyleProps) + Contenu métier + actions hiérarchiques.
// =====================================================================

'use client';

import React, { useState } from 'react';
import { Copy, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@qoe/ui/select';
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
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';

type PanelTab = 'style' | 'text' | 'content' | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-transparent flex w-full! items-center justify-between px-2 py-1.5 text-[11px]! font-medium! h-auto! leading-[inherit]! whitespace-normal! "
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-3! w-3! text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Button>
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
          className="flex max-w-[min(92vw,720px)] flex-col rounded-lg border border-border/70 bg-background/95 shadow-md backdrop-blur-md"
        >
          <div className="flex items-center gap-1 p-1 text-xs">
            <div className="flex items-center px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <span className="capitalize">{selected.type.replace('-', ' ')}</span>
            </div>
            <div className="mx-1 h-4 w-px bg-border/60" />
            {(['style', 'text', 'content'] as const).map((panelId) => (
              <Button
                variant="solid"
                tone="brand"
                size="xs"
                key={panelId}
                type="button"
                onClick={() => setPanel((p) => (p === panelId ? null : panelId))}
                className={`rounded-lg px-2 py-1 text-[11px]! font-medium! transition-colors ${
                  panel === panelId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                } h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block `}
              >
                {panelId === 'style' ? t`Style` : panelId === 'text' ? t`Texte` : t`Contenu`}
              </Button>
            ))}
            <div className="mx-1 h-4 w-px bg-border/60" />
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                type="button"
                onClick={() => engine.moveBlock(selected.id, 'up')}
                title={t`Monter (⌥↑)`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <ArrowUp className="h-3.5! w-3.5!" />
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => engine.moveBlock(selected.id, 'down')}
                title={t`Descendre (⌥↓)`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <ArrowDown className="h-3.5! w-3.5!" />
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => engine.duplicateBlock(selected.id)}
                title={t`Dupliquer (⌘D)`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <Copy className="h-3.5! w-3.5!" />
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => engine.toggleVisibility(selected.id)}
                title={selected.visible ? t`Masquer` : t`Afficher`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                {selected.visible ? (
                  <Eye className="h-3.5! w-3.5!" />
                ) : (
                  <EyeOff className="h-3.5! w-3.5! text-destructive-text" />
                )}
              </Button>
              <Button
                variant="solid"
                tone="danger"
                type="button"
                onClick={() => engine.deleteBlock(selected.id)}
                title={t`Supprimer (⌫)`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              >
                <Trash2 className="h-3.5! w-3.5!" />
              </Button>
            </div>
          </div>

          {panel && (
            <div className="max-h-[50vh] w-[380px] space-y-1.5 overflow-y-auto border-t border-border/50 p-2">
              {panel === 'style' && (
                <>
                  <Section title={t`Fond`}>
                    <BackgroundControl />
                  </Section>
                  <Section title={t`Bordure + Rayon`}>
                    <BorderControl />
                    <RadiusControl />
                  </Section>
                  <Section title={t`Disposition Flex`}>
                    <DisplayControl />
                  </Section>
                  <Section title={t`Marges`}>
                    <PaddingControl />
                    <MarginControl />
                  </Section>
                  <Section title={t`Dimensions + Opacité`}>
                    <DimensionControl />
                    <OpacityControl />
                  </Section>
                </>
              )}
              {panel === 'text' && (
                <>
                  <Section title={t`Police`}>
                    <FontControls />
                  </Section>
                  <Section title={t`Typographie avancée`}>
                    <AdvancedTypoControls />
                  </Section>
                </>
              )}
              {panel === 'content' && (
                <div className="space-y-2">
                  {selected.type === 'hero' && (
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {t`Variante visuelle`}
                      </span>
                      <Select
                        label={t`Variante visuelle`}
                        hideLabel
                        size="xs"
                        value={(props.style as string) || 'cinematic-banner'}
                        onValueChange={(style) => engine.updateBlockProps(selected.id, { style })}
                        options={[
                          { id: 'cinematic-banner', label: t`Bannière` },
                          { id: 'typographic-minimal', label: t`Typographique` },
                          { id: 'split-featured', label: 'Deux Colonnes' },
                          { id: 'floating-card', label: t`Carte Flottante` },
                        ]}
                      />
                    </label>
                  )}
                  {selected.type === 'bento-grid' && (
                    <div className="flex items-center gap-1">
                      {[2, 3].map((cols) => (
                        <Button
                          variant="solid"
                          tone="brand"
                          size="xs"
                          key={cols}
                          type="button"
                          onClick={() => engine.updateBlockProps(selected.id, { columns: cols })}
                          className={`rounded-lg px-2 py-1 text-[11px]! font-medium! transition-colors ${
                            (props.columns || 3) === cols
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted/50'
                          } h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block `}
                        >
                          {cols} {t`Cols`}
                        </Button>
                      ))}
                    </div>
                  )}
                  {selected.type === 'article-stream' && (
                    <label className="block space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {t`Présentation`}
                      </span>
                      <Select
                        label={t`Présentation`}
                        hideLabel
                        size="xs"
                        value={(props.displayMode as string) || 'grid-3'}
                        onValueChange={(displayMode) =>
                          engine.updateBlockProps(selected.id, { displayMode })
                        }
                        options={[
                          { id: 'list', label: t`Lignes` },
                          { id: 'grid-2', label: t`Grille 2` },
                          { id: 'grid-3', label: t`Grille 3` },
                        ]}
                      />
                    </label>
                  )}
                  {(selected.type === 'navbar' ||
                    selected.type === 'footer' ||
                    selected.type === 'lead-story') && (
                    <p className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      {t`Réglages dans l'inspecteur droit.`}
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
