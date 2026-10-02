// =====================================================================
// BlockWrapper.tsx — Enveloppe de bloc
// =====================================================================
// En live : rendu direct. En editable : sélection et actions.
// =====================================================================

import React from 'react';
import { ArrowUp, ArrowDown, Trash2, EyeOff } from 'lucide-react';
import type { BlockStyleProps, TemplateRenderContext } from '../schema';
import { resolveBlockStyle } from '../style';

interface BlockWrapperProps {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  locked?: boolean;
  context: TemplateRenderContext;
  children: React.ReactNode;
  styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
  blockStyle?: BlockStyleProps;
}

export function BlockWrapper({
  id,
  type,
  label,
  visible,
  locked,
  context,
  children,
  styleBox,
  blockStyle,
}: BlockWrapperProps) {
  const { mode, selectedBlockId, onSelectBlock, onMoveBlock, onDeleteBlock } = context;

  const hasBox =
    styleBox &&
    (Number(styleBox.pt ?? 0) > 0 ||
      Number(styleBox.pb ?? 0) > 0 ||
      Number(styleBox.maxWidth ?? 0) > 0 ||
      (styleBox.opacity !== undefined && Number(styleBox.opacity) < 100));

  const legacyBox: React.CSSProperties = hasBox
    ? {
        paddingTop: Number(styleBox?.pt ?? 0) > 0 ? `${styleBox?.pt}px` : undefined,
        paddingBottom: Number(styleBox?.pb ?? 0) > 0 ? `${styleBox?.pb}px` : undefined,
        maxWidth: Number(styleBox?.maxWidth ?? 0) > 0 ? `${styleBox?.maxWidth}px` : undefined,
        marginLeft: Number(styleBox?.maxWidth ?? 0) > 0 ? 'auto' : undefined,
        marginRight: Number(styleBox?.maxWidth ?? 0) > 0 ? 'auto' : undefined,
        opacity:
          styleBox?.opacity !== undefined && Number(styleBox.opacity) < 100
            ? Number(styleBox.opacity) / 100
            : undefined,
      }
    : {};

  const fineStyle = resolveBlockStyle(blockStyle);
  const boxStyle: React.CSSProperties = { ...fineStyle, ...legacyBox };
  const hasStyle = Object.keys(boxStyle).length > 0;

  // En mode public / live : zéro surcharge sauf style custom
  if (mode === 'live') {
    if (!visible) return null;
    if (!hasStyle) return <>{children}</>;
    return (
      <div data-block-id={id} data-block-type={type} style={boxStyle}>
        {children}
      </div>
    );
  }

  const isSelected = selectedBlockId === id;

  return (
    <div
      data-block-id={id}
      data-block-type={type}
      style={hasStyle ? boxStyle : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelectBlock?.(id);
      }}
      className={`group/block relative transition-all duration-200 cursor-pointer ${
        !visible ? 'opacity-40 grayscale' : ''
      } ${
        isSelected
          ? 'ring-1 ring-[var(--tenant-accent,hsl(var(--primary)))] z-30'
          : 'hover:ring-1 hover:ring-[var(--tenant-accent,hsl(var(--primary)))]/40'
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
        <div className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground text-background flex items-center gap-1.5">
          <span>{label}</span>
          {!visible && (
            <span className="flex items-center gap-1 text-[10px] opacity-80">
              <EyeOff className="w-3 h-3" /> Masqué
            </span>
          )}
        </div>

        {isSelected && !locked && (
          <div className="flex items-center bg-card border border-border shadow-sm rounded-lg p-0.5 text-muted-foreground">
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
