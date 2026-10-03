// =====================================================================
// TopBar.tsx — Barre supérieure de Qoefi Stage
// =====================================================================

'use client';

import React from 'react';
import Link from 'next/link';
import {
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
import type { StageMode } from '../types';

interface TopBarProps {
  publicationName: string;
  domain: string;
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
  onPublish: () => void;
  isPublishing: boolean;
  unpublished: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({
  publicationName,
  domain,
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
  onPublish,
  isPublishing,
  unpublished,
  onToggleSidebar,
}: TopBarProps) {
  const percentage = Math.round(scale * 100);
  const publishState = hasUnsavedChanges ? 'dirty' : unpublished ? 'unpublished' : 'published';

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

        {/* Bouton d'enregistrement (brouillon) et publication */}
        {publishState === 'dirty' ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            title="Enregistrer le brouillon (le site public ne change pas)"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium shadow-xs transition-all bg-primary text-primary-foreground hover:opacity-95"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Enregistrer</span>
          </button>
        ) : publishState === 'unpublished' ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            title="Mettre le brouillon en ligne"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium shadow-xs transition-all bg-primary text-primary-foreground hover:opacity-95"
          >
            {isPublishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Brouillon · Publier</span>
          </button>
        ) : (
          <span
            title="Le site public reflète l'atelier"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium bg-muted text-muted-foreground"
          >
            <span>Publié</span>
          </span>
        )}
      </div>
    </header>
  );
}
