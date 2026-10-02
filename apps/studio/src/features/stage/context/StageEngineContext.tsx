// =====================================================================
// 🧠 StageEngineContext.tsx — Moteur d'État Réactif de Qoefi Stage (Adapté d'Onlook)
// =====================================================================

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type {
  LayoutConfig,
  TemplateBlock,
  TemplatePublicationContext,
  TemplateArticleItem,
} from '@qoe/ui/templates';

export enum StageEditorMode {
  DESIGN = 'design',
  PAN = 'pan',
  PREVIEW = 'preview',
}

export interface StageEngineContextType {
  // ── Modèle de Données & Layout ──
  layout: LayoutConfig;
  publication: TemplatePublicationContext;
  articles: TemplateArticleItem[];
  selectedBlockId: string | null;
  selectedBlock: TemplateBlock | null;
  selectBlock: (id: string | null) => void;
  updateBlockProps: (id: string, newProps: Record<string, unknown>) => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, direction: 'up' | 'down') => void;
  toggleVisibility: (id: string) => void;
  updateTokens: (tokens: Partial<LayoutConfig['tokens']>) => void;
  selectArchetype: (archetypeId: string) => void;

  // ── État Canvas (Zoom & Pan) ──
  scale: number;
  position: { x: number; y: number };
  setScale: (scale: number | ((prev: number) => number)) => void;
  setPosition: (
    pos: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  // ── Modes & Outils ──
  editorMode: StageEditorMode;
  setEditorMode: (mode: StageEditorMode) => void;
  device: 'desktop' | 'tablet' | 'mobile';
  setDevice: (d: 'desktop' | 'tablet' | 'mobile') => void;

  // ── Historique Undo / Redo ──
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // ── Sauvegarde ──
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  save: () => Promise<void>;

  // ── Tiroir Studio Navigation ──
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;

  // ── Panneau Gauche Étendu ──
  leftPanelTab: 'layers' | 'brand' | 'pages' | 'blocks' | null;
  setLeftPanelTab: (tab: 'layers' | 'brand' | 'pages' | 'blocks' | null) => void;
  leftPanelLocked: boolean;
  setLeftPanelLocked: (locked: boolean) => void;
}

const StageEngineContext = createContext<StageEngineContextType | null>(null);

export function useStageEngine() {
  const ctx = useContext(StageEngineContext);
  if (!ctx) {
    throw new Error('useStageEngine must be used within StageEngineProvider');
  }
  return ctx;
}

// Alias pour compatibilité directe avec les fichiers copiés d'Onlook
export const useEditorEngine = useStageEngine;

export function StageEngineProvider({
  children,
  initialLayout,
  publication,
  articles,
}: {
  children: React.ReactNode;
  initialLayout: LayoutConfig;
  publication: TemplatePublicationContext;
  articles: TemplateArticleItem[];
}) {
  const [layout, setLayout] = useState<LayoutConfig>(initialLayout);
  const [past, setPast] = useState<LayoutConfig[]>([]);
  const [future, setFuture] = useState<LayoutConfig[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<StageEditorMode>(StageEditorMode.DESIGN);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [leftPanelTab, setLeftPanelTab] = useState<'layers' | 'brand' | 'pages' | 'blocks' | null>(
    'layers'
  );
  const [leftPanelLocked, setLeftPanelLocked] = useState(true);

  const [scale, setScale] = useState(0.95);
  const [position, setPosition] = useState({ x: 60, y: 20 });

  // ── Historique ──
  const pushState = useCallback(
    (newLayout: LayoutConfig) => {
      setPast((prev) => [...prev.slice(-30), layout]);
      setFuture([]);
      setLayout(newLayout);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, p.length - 1));
    setFuture((f) => [layout, ...f]);
    setLayout(prev);
    setHasUnsavedChanges(true);
  }, [past, layout]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, layout]);
    setLayout(next);
    setHasUnsavedChanges(true);
  }, [future, layout]);

  // ── Sélection du bloc actif ──
  const selectedBlock = useMemo(
    () => layout.blocks.find((b) => b.id === selectedBlockId) || null,
    [layout.blocks, selectedBlockId]
  );

  const selectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id);
  }, []);

  // ── Mutations de Blocs ──
  const updateBlockProps = useCallback((id: string, newProps: Record<string, unknown>) => {
    setLayout((curr) => {
      const nextBlocks = curr.blocks.map((b) =>
        b.id === id ? { ...b, props: { ...(b.props as Record<string, unknown>), ...newProps } } : b
      );
      const nextLayout = { ...curr, blocks: nextBlocks };
      setPast((prev) => [...prev.slice(-30), curr]);
      setFuture([]);
      setHasUnsavedChanges(true);
      return nextLayout;
    });
  }, []);

  const duplicateBlock = useCallback((id: string) => {
    setLayout((curr) => {
      const idx = curr.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return curr;
      const original = curr.blocks[idx];
      const dupId = `${original.type}_${Date.now()}`;
      const duplicate: TemplateBlock = {
        ...original,
        id: dupId,
        props: { ...(original.props as Record<string, unknown>) },
      };
      const nextBlocks = [...curr.blocks];
      nextBlocks.splice(idx + 1, 0, duplicate);
      const nextLayout = { ...curr, blocks: nextBlocks };
      setPast((prev) => [...prev.slice(-30), curr]);
      setFuture([]);
      setSelectedBlockId(dupId);
      setHasUnsavedChanges(true);
      return nextLayout;
    });
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setLayout((curr) => {
      const nextBlocks = curr.blocks.filter((b) => b.id !== id);
      const nextLayout = { ...curr, blocks: nextBlocks };
      setPast((prev) => [...prev.slice(-30), curr]);
      setFuture([]);
      setSelectedBlockId(null);
      setHasUnsavedChanges(true);
      return nextLayout;
    });
  }, []);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    setLayout((curr) => {
      const idx = curr.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return curr;
      if (direction === 'up' && idx === 0) return curr;
      if (direction === 'down' && idx === curr.blocks.length - 1) return curr;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      const nextBlocks = [...curr.blocks];
      const [moved] = nextBlocks.splice(idx, 1);
      nextBlocks.splice(targetIdx, 0, moved);

      const nextLayout = { ...curr, blocks: nextBlocks };
      setPast((prev) => [...prev.slice(-30), curr]);
      setFuture([]);
      setHasUnsavedChanges(true);
      return nextLayout;
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setLayout((curr) => {
      const nextBlocks = curr.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b));
      const nextLayout = { ...curr, blocks: nextBlocks };
      setPast((prev) => [...prev.slice(-30), curr]);
      setFuture([]);
      setHasUnsavedChanges(true);
      return nextLayout;
    });
  }, []);

  const updateTokens = useCallback(
    (tokens: Partial<LayoutConfig['tokens']>) => {
      pushState({
        ...layout,
        tokens: { ...layout.tokens, ...tokens },
      });
    },
    [layout, pushState]
  );

  const selectArchetype = useCallback((_archetypeId: string) => {
    // Sera alimenté par les archetypes constants
  }, []);

  // ── Zoom Actions ──
  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + 0.15, 2.5));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s - 0.15, 0.2));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(0.95);
    setPosition({ x: 60, y: 20 });
  }, []);

  // ── Sauvegarde ──
  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/publication', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationId: publication.id,
          layoutStyle: JSON.stringify(layout),
        }),
      });
      if (!res.ok) {
        const pubId = publication.id || '';
        await fetch(`/v1/settings/publication?publicationId=${encodeURIComponent(pubId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicationId: pubId,
            layoutStyle: JSON.stringify(layout),
          }),
        }).catch(() => null);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Erreur sauvegarde Stage :', err);
    } finally {
      setIsSaving(false);
    }
  }, [layout, publication.id]);

  const value = useMemo<StageEngineContextType>(
    () => ({
      layout,
      publication,
      articles,
      selectedBlockId,
      selectedBlock,
      selectBlock,
      updateBlockProps,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      toggleVisibility,
      updateTokens,
      selectArchetype,
      scale,
      position,
      setScale,
      setPosition,
      zoomIn,
      zoomOut,
      resetZoom,
      editorMode,
      setEditorMode,
      device,
      setDevice,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo,
      redo,
      isSaving,
      hasUnsavedChanges,
      save,
      isSidebarOpen,
      setIsSidebarOpen,
      leftPanelTab,
      setLeftPanelTab,
      leftPanelLocked,
      setLeftPanelLocked,
    }),
    [
      layout,
      publication,
      articles,
      selectedBlockId,
      selectedBlock,
      selectBlock,
      updateBlockProps,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      toggleVisibility,
      updateTokens,
      selectArchetype,
      scale,
      position,
      zoomIn,
      zoomOut,
      resetZoom,
      editorMode,
      device,
      past.length,
      future.length,
      undo,
      redo,
      isSaving,
      hasUnsavedChanges,
      save,
      isSidebarOpen,
      leftPanelTab,
      leftPanelLocked,
    ]
  );

  return <StageEngineContext.Provider value={value}>{children}</StageEngineContext.Provider>;
}
