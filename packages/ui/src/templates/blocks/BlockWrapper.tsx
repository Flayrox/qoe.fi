// =====================================================================
// 📦 BlockWrapper.tsx — Enveloppe Polymorphe de Bloc (Licorne 2026)
// =====================================================================
// En mode "live" (site public) : Rendu direct sans aucune surcharge de DOM.
// En mode "editable" (Studio) : Fournit le cadre interactif de sélection,
// survol subtil, badge d'identification et poignées d'action rapide.
// =====================================================================

import React from 'react';
import { ArrowUp, ArrowDown, Trash2, EyeOff } from 'lucide-react';
import type { TemplateRenderContext } from '../schema';

interface BlockWrapperProps {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  locked?: boolean;
  context: TemplateRenderContext;
  children: React.ReactNode;
}

export function BlockWrapper({
  id,
  type,
  label,
  visible,
  locked,
  context,
  children,
}: BlockWrapperProps) {
  const { mode, selectedBlockId, onSelectBlock, onMoveBlock, onDeleteBlock } = context;

  // En mode public / live : zéro surcharge, rendu brut
  if (mode === 'live') {
    if (!visible) return null;
    return <>{children}</>;
  }

  const isSelected = selectedBlockId === id;

  return (
    <div
      data-block-type={type}
      onClick={(e) => {
        e.stopPropagation();
        onSelectBlock?.(id);
      }}
      className={`group/block relative transition-all duration-200 cursor-pointer ${
        !visible ? 'opacity-40 grayscale' : ''
      } ${
        isSelected
          ? 'ring-2 ring-[var(--tenant-accent,hsl(var(--primary)))] shadow-md z-30'
          : 'hover:ring-1 hover:ring-[var(--tenant-accent,hsl(var(--primary)))]/40 hover:bg-[var(--tenant-accent,hsl(var(--primary)))]/[0.02]'
      }`}
    >
      {/* Badge Flottant d'Identification & Actions */}
      <div
        className={`absolute top-2 left-4 z-40 flex items-center gap-2 pointer-events-auto transition-all ${
          isSelected
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-1 group-hover/block:opacity-100 group-hover/block:translate-y-0'
        }`}
      >
        <div
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white shadow-sm flex items-center gap-1.5"
          style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
        >
          <span>{label}</span>
          {!visible && (
            <span className="flex items-center gap-1 text-[10px] opacity-80">
              <EyeOff className="w-3 h-3" /> Masqué
            </span>
          )}
        </div>

        {isSelected && !locked && (
          <div className="flex items-center bg-card border border-border shadow-md rounded-md p-0.5 text-muted-foreground">
            <button
              type="button"
              title="Monter la section"
              onClick={(e) => {
                e.stopPropagation();
                onMoveBlock?.(id, 'up');
              }}
              className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Descendre la section"
              onClick={(e) => {
                e.stopPropagation();
                onMoveBlock?.(id, 'down');
              }}
              className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            {onDeleteBlock && (
              <button
                type="button"
                title="Supprimer la section"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBlock(id);
                }}
                className="p-1 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Contenu du bloc */}
      {children}
    </div>
  );
}
