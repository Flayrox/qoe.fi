// =====================================================================
// 🧠 StageEngineContext.tsx — Moteur d'État Réactif de Qoefi Stage (Adapté d'Onlook)
// =====================================================================

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type {
  LayoutConfig,
  TemplateBlock,
  TemplateNode,
  TemplatePublicationContext,
  TemplateArticleItem,
} from '@qoe/ui/templates';
import { ARCHETYPES_REGISTRY } from '@qoe/ui/templates';

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
  selectedOid: string | null;
  selectedPath: string | null;
  selectBlock: (id: string | null) => void;
  selectNode: (oid: string | null, path: string | null, blockId: string | null) => void;
  updateBlockProps: (id: string, newProps: Record<string, unknown>) => void;
  updateNode: (blockId: string, oid: string, patch: Partial<TemplateNode>) => void;
  addBlock: (type: string, label: string) => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, direction: 'up' | 'down') => void;
  moveBlockTo: (id: string, toIndex: number) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
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
  leftPanelTab: 'layers' | 'brand' | 'pages' | 'blocks' | 'images' | 'windows' | null;
  setLeftPanelTab: (
    tab: 'layers' | 'brand' | 'pages' | 'blocks' | 'images' | 'windows' | null
  ) => void;
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
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<StageEditorMode>(StageEditorMode.DESIGN);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [leftPanelTab, setLeftPanelTab] = useState<
    'layers' | 'brand' | 'pages' | 'blocks' | 'images' | 'windows' | null
  >('layers');
  const [leftPanelLocked, setLeftPanelLocked] = useState(true);

  const [scale, setScale] = useState(0.95);
  const [position, setPosition] = useState({ x: 60, y: 20 });

  // ── Historique ──
  const pushState = useCallback(
    (newLayout: LayoutConfig) => {
      setPast((prev) => [...prev.slice(-49), layout]);
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
    setSelectedOid(null);
    setSelectedPath(null);
  }, []);

  const selectNode = useCallback(
    (oid: string | null, path: string | null, blockId: string | null) => {
      if (blockId) setSelectedBlockId(blockId);
      setSelectedOid(oid);
      setSelectedPath(path);
    },
    []
  );

  // ── Mutations de Blocs (sans setState dans updater — StrictMode safe) ──
  const updateBlockProps = useCallback(
    (id: string, newProps: Record<string, unknown>) => {
      const nextBlocks = layout.blocks.map((b) =>
        b.id === id ? { ...b, props: { ...(b.props as Record<string, unknown>), ...newProps } } : b
      );
      if (nextBlocks === layout.blocks) return;
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  function patchNodes(
    nodes: TemplateNode[] | undefined,
    oid: string,
    patch: Partial<TemplateNode>
  ): TemplateNode[] | undefined {
    if (!nodes) return undefined;
    let changed = false;
    const next = nodes.map((n) => {
      if (n.oid === oid) {
        changed = true;
        return { ...n, ...patch, oid: n.oid };
      }
      if (n.children) {
        const c = patchNodes(n.children, oid, patch);
        if (c) {
          changed = true;
          return { ...n, children: c };
        }
      }
      return n;
    });
    return changed ? next : undefined;
  }

  const updateNode = useCallback(
    (blockId: string, oid: string, patch: Partial<TemplateNode>) => {
      const nextBlocks = layout.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const nodes = patchNodes(b.nodes, oid, patch);
        if (nodes) return { ...b, nodes };
        if (b.slots) {
          let changed = false;
          const slots: Record<string, TemplateNode[]> = {};
          for (const [k, v] of Object.entries(b.slots)) {
            const nv = patchNodes(v, oid, patch);
            if (nv) {
              changed = true;
              slots[k] = nv;
            } else {
              slots[k] = v;
            }
          }
          if (changed) return { ...b, slots };
        }
        return b;
      });
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const addBlock = useCallback(
    (type: string, label: string) => {
      const newId = `block_${type}_${Date.now()}`;
      const newBlock: TemplateBlock = {
        id: newId,
        type: type as TemplateBlock['type'],
        label,
        visible: true,
        locked: false,
        props: {},
      };
      const footerIdx = layout.blocks.findIndex((b) => b.type === 'footer');
      const nextBlocks = [...layout.blocks];
      if (footerIdx !== -1) nextBlocks.splice(footerIdx, 0, newBlock);
      else nextBlocks.push(newBlock);
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setSelectedBlockId(newId);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const idx = layout.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return;
      const original = layout.blocks[idx];
      const dupId = `${original.type}_${Date.now()}`;
      const duplicate: TemplateBlock = {
        ...original,
        id: dupId,
        props: { ...(original.props as Record<string, unknown>) },
      };
      const nextBlocks = [...layout.blocks];
      nextBlocks.splice(idx + 1, 0, duplicate);
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setSelectedBlockId(dupId);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      if (!layout.blocks.some((b) => b.id === id)) return;
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: layout.blocks.filter((b) => b.id !== id) });
      setSelectedBlockId(null);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const moveBlock = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const idx = layout.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return;
      if (direction === 'up' && idx === 0) return;
      if (direction === 'down' && idx === layout.blocks.length - 1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      const nextBlocks = [...layout.blocks];
      const [moved] = nextBlocks.splice(idx, 1);
      nextBlocks.splice(targetIdx, 0, moved);

      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({
        ...layout,
        blocks: layout.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)),
      });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const toggleLock = useCallback(
    (id: string) => {
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({
        ...layout,
        blocks: layout.blocks.map((b) => (b.id === id ? { ...b, locked: !b.locked } : b)),
      });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const moveBlockTo = useCallback(
    (id: string, toIndex: number) => {
      const from = layout.blocks.findIndex((b) => b.id === id);
      if (from === -1) return;
      const clamped = Math.max(0, Math.min(layout.blocks.length - 1, toIndex));
      if (clamped === from) return;
      const nextBlocks = [...layout.blocks];
      const [moved] = nextBlocks.splice(from, 1);
      nextBlocks.splice(clamped, 0, moved);
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const updateTokens = useCallback(
    (tokens: Partial<LayoutConfig['tokens']>) => {
      pushState({
        ...layout,
        tokens: { ...layout.tokens, ...tokens },
      });
    },
    [layout, pushState]
  );

  const selectArchetype = useCallback(
    (archetypeId: string) => {
      const target = ARCHETYPES_REGISTRY[archetypeId];
      if (!target) return;
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({
        ...layout,
        archetype: target.archetype,
        tokens: { ...target.tokens },
        blocks: target.blocks.map((b) => ({ ...b, id: `${b.id}_${Date.now()}` })),
      });
      setSelectedBlockId(null);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

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
      selectedOid,
      selectedPath,
      selectBlock,
      selectNode,
      updateBlockProps,
      updateNode,
      addBlock,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      moveBlockTo,
      toggleVisibility,
      toggleLock,
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
      selectedOid,
      selectedPath,
      selectBlock,
      selectNode,
      updateBlockProps,
      updateNode,
      addBlock,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      moveBlockTo,
      toggleVisibility,
      toggleLock,
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
