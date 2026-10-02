// =====================================================================
// TopBar.tsx — Barre supérieure de Qoefi Stage
// =====================================================================

'use client';

import React from 'react';
import Link from 'next/link';
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  ExternalLink,
  Eye,
  Edit3,
  ZoomIn,
  ZoomOut,
  Save,
  Loader2,
  Menu,
} from 'lucide-react';
import type { StageDevice, StageMode } from '../types';
import { DEVICE_DIMENSIONS } from '../types';

interface TopBarProps {
  publicationName: string;
  domain: string;
  device: StageDevice;
  onDeviceChange: (device: StageDevice) => void;
  mode: StageMode;
  onModeChange: (mode: StageMode) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({
  publicationName,
  domain,
  device,
  onDeviceChange,
  mode,
  onModeChange,
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  isSaving,
  hasUnsavedChanges,
  onToggleSidebar,
}: TopBarProps) {
  const percentage = Math.round(scale * 100);

  return (
    <header className="h-10 w-full px-3 flex items-center justify-between bg-background/85 backdrop-blur-xl border-b border-border/40 select-none z-50 text-xs">
      {/* ── Gauche : Menu Studio, Breadcrumb & Sélecteur Device ── */}
      <div className="flex items-center gap-3">
        {/* Déclencheur du tiroir Studio Navigation */}
        <button
          type="button"
          onClick={onToggleSidebar}
          title="Ouvrir la navigation Studio"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-foreground/80 hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Fil d'ariane */}
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <span className="text-foreground max-w-[140px] truncate">{publicationName}</span>
          <span className="opacity-40">/</span>
          <span className="text-foreground font-semibold">Stage</span>
        </div>

        <div className="h-4 w-px bg-border/60 mx-1" />

        {/* Sélecteur de Devices (Desktop / Tablet / Mobile) */}
        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/40">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => {
            const isSelected = device === d;
            const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDeviceChange(d)}
                title={`${DEVICE_DIMENSIONS[d].label} (${DEVICE_DIMENSIONS[d].width}px)`}
                className={`p-1.5 rounded-md transition-all ${
                  isSelected
                    ? 'bg-background text-foreground shadow-xs font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Centre : Mode Toggle (Design vs Aperçu) ── */}
      <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/40">
        <button
          type="button"
          onClick={() => onModeChange('design')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
            mode === 'design'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Edit3 className="w-3 h-3" />
          <span>Design</span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('preview')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
            mode === 'preview'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Eye className="w-3 h-3" />
          <span>Aperçu</span>
        </button>
      </div>

      {/* ── Droite : Zoom, Undo/Redo, Live Link & Publication ── */}
      <div className="flex items-center gap-2">
        {/* Contrôles de Zoom */}
        <div className="hidden md:flex items-center gap-1 bg-muted/50 px-1 py-0.5 rounded-lg border border-border/30">
          <button
            type="button"
            onClick={onZoomOut}
            title="Zoom arrière (⌘-)"
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            title="Recentrer le canvas (⇧0)"
            className="px-1.5 py-0.5 text-[11px] font-mono font-medium text-foreground/80 hover:text-foreground"
          >
            {percentage}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            title="Zoom avant (⌘+)"
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Annuler (⌘Z)"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Rétablir (⌘⇧Z)"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-border/60 mx-1" />

        {/* Lien direct vers le site live */}
        <Link
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Ouvrir le site public"
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors"
        >
          <span className="truncate max-w-[120px]">{domain}</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </Link>

        {/* Bouton de sauvegarde & publication */}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium shadow-xs transition-all ${
            hasUnsavedChanges
              ? 'bg-primary text-primary-foreground hover:opacity-95'
              : 'bg-muted text-muted-foreground opacity-70 hover:opacity-100'
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{hasUnsavedChanges ? 'Publier' : 'À jour'}</span>
        </button>
      </div>
    </header>
  );
}
