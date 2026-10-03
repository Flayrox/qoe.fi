// =====================================================================
// StageEngineContext.tsx — État réactif de Qoefi Stage
// =====================================================================

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type {
  LayoutConfig,
  TemplateBlock,
  TemplateNode,
  TemplatePublicationContext,
  TemplateArticleItem,
} from '@qoe/ui/templates';
import {
  ARCHETYPES_REGISTRY,
  ARTICLE_DEFAULT_CONFIG,
  ARTICLE_VARIANTS,
  serializeSiteLayouts,
} from '@qoe/ui/templates';

export enum StageEditorMode {
  DESIGN = 'design',
  PAN = 'pan',
  PREVIEW = 'preview',
}

/** Point de restauration local (versions sans backend) */
export interface StageSnapshot {
  id: string;
  name: string;
  at: number;
  page: 'home' | 'article';
  layout: LayoutConfig;
}

const SNAPSHOT_CAP = 20;

function snapshotKey(publicationId: string | undefined): string {
  return `qoe.stage.versions.${publicationId || 'unknown'}`;
}

function readSnapshots(publicationId: string | undefined): StageSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(snapshotKey(publicationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StageSnapshot[];
    return Array.isArray(parsed) ? parsed.slice(0, SNAPSHOT_CAP) : [];
  } catch {
    return [];
  }
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
  selectedNode: { node: TemplateNode; slotKey: string | null } | null;
  selectBlock: (id: string | null) => void;
  selectNode: (oid: string | null, path: string | null, blockId: string | null) => void;
  updateBlockProps: (id: string, newProps: Record<string, unknown>) => void;
  updateNode: (blockId: string, oid: string, patch: Partial<TemplateNode>) => void;
  addNode: (blockId: string, slotKey: string | null, kind: TemplateNode['kind']) => void;
  removeNode: (blockId: string, oid: string) => void;
  moveNode: (blockId: string, oid: string, direction: 'up' | 'down') => void;
  addBlock: (type: string, label: string) => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, direction: 'up' | 'down') => void;
  moveBlockTo: (id: string, toIndex: number) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  updateTokens: (tokens: Partial<LayoutConfig['tokens']>) => void;
  selectArchetype: (archetypeId: string) => void;

  // ── Scopes de pages (accueil / article) ──
  stagePage: 'home' | 'article';
  setStagePage: (page: 'home' | 'article') => void;
  applyArticleVariant: (variantId: string) => void;
  toggleHiddenAt: (id: string, device: 'mobile' | 'tablet') => void;

  // ── Versions locales (points de restauration) ──
  snapshots: StageSnapshot[];
  saveSnapshot: (name?: string) => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;

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
  initialArticleLayout,
  publication,
  articles,
}: {
  children: React.ReactNode;
  initialLayout: LayoutConfig;
  initialArticleLayout: LayoutConfig | null;
  publication: TemplatePublicationContext;
  articles: TemplateArticleItem[];
}) {
  const [scoped, setScoped] = useState<{ home: LayoutConfig; article: LayoutConfig | null }>({
    home: initialLayout,
    article: initialArticleLayout,
  });
  const [stagePage, setStagePageState] = useState<'home' | 'article'>('home');
  const pageRef = useRef<'home' | 'article'>('home');
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

  // Layout actif (scope accueil ou article). L'historique est volontairement
  // réinitialisé au changement de page pour ne jamais mélanger les scopes.
  const layout = scoped[stagePage] ?? scoped.home;
  const setLayout = useCallback((next: LayoutConfig | ((prev: LayoutConfig) => LayoutConfig)) => {
    const page = pageRef.current;
    setScoped((prev) => {
      const current = prev[page] ?? prev.home;
      const resolved =
        typeof next === 'function' ? (next as (p: LayoutConfig) => LayoutConfig)(current) : next;
      return { ...prev, [page]: resolved };
    });
  }, []);

  const setStagePage = useCallback((page: 'home' | 'article') => {
    pageRef.current = page;
    setStagePageState(page);
    setSelectedBlockId(null);
    setSelectedOid(null);
    setSelectedPath(null);
    setPast([]);
    setFuture([]);
    if (page === 'article') {
      setScoped((prev) =>
        prev.article
          ? prev
          : { ...prev, article: JSON.parse(JSON.stringify(ARTICLE_DEFAULT_CONFIG)) as LayoutConfig }
      );
      setHasUnsavedChanges(true);
    }
  }, []);

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

  function removeNodes(nodes: TemplateNode[] | undefined, oid: string): TemplateNode[] | undefined {
    if (!nodes) return undefined;
    let changed = false;
    const next: TemplateNode[] = [];
    for (const n of nodes) {
      if (n.oid === oid) {
        changed = true;
        continue;
      }
      if (n.children) {
        const c = removeNodes(n.children, oid);
        if (c) {
          changed = true;
          next.push({ ...n, children: c });
          continue;
        }
      }
      next.push(n);
    }
    return changed ? next : undefined;
  }

  function findNode(
    block: TemplateBlock,
    oid: string
  ): { node: TemplateNode; slotKey: string | null } | null {
    const search = (
      nodes: TemplateNode[] | undefined,
      slotKey: string | null
    ): { node: TemplateNode; slotKey: string | null } | null => {
      if (!nodes) return null;
      for (const n of nodes) {
        if (n.oid === oid) return { node: n, slotKey };
        const found = search(n.children, slotKey);
        if (found) return found;
      }
      return null;
    };
    const inNodes = search(block.nodes, null);
    if (inNodes) return inNodes;
    if (block.slots) {
      for (const [k, v] of Object.entries(block.slots)) {
        const found = search(v, k);
        if (found) return found;
      }
    }
    return null;
  }

  const addNode = useCallback(
    (blockId: string, slotKey: string | null, kind: TemplateNode['kind']) => {
      const oid = `oid_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
      const node: TemplateNode = {
        oid,
        kind,
        ...(kind === 'text' ? { tag: 'p' as const, textFallback: 'Texte' } : {}),
        ...(kind === 'button' ? { textFallback: 'Bouton', overrides: {} } : {}),
        ...(kind === 'badge' ? { textFallback: 'Badge' } : {}),
        ...(kind === 'image' ? { tag: 'img' as const, overrides: {} } : {}),
      };
      const nextBlocks = layout.blocks.map((b) => {
        if (b.id !== blockId) return b;
        if (slotKey) {
          return {
            ...b,
            slots: { ...(b.slots ?? {}), [slotKey]: [...(b.slots?.[slotKey] ?? []), node] },
          };
        }
        return { ...b, nodes: [...(b.nodes ?? []), node] };
      });
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setSelectedOid(oid);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const removeNode = useCallback(
    (blockId: string, oid: string) => {
      const nextBlocks = layout.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const nodes = removeNodes(b.nodes, oid);
        if (nodes) return { ...b, nodes: nodes.length > 0 ? nodes : undefined };
        if (b.slots) {
          let changed = false;
          const slots: Record<string, TemplateNode[]> = {};
          for (const [k, v] of Object.entries(b.slots)) {
            const nv = removeNodes(v, oid);
            if (nv) {
              changed = true;
              if (nv.length > 0) slots[k] = nv;
            } else {
              slots[k] = v;
            }
          }
          if (changed) {
            const cleaned = Object.keys(slots).length > 0 ? slots : undefined;
            return { ...b, slots: cleaned };
          }
        }
        return b;
      });
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({ ...layout, blocks: nextBlocks });
      setSelectedOid(null);
      setSelectedPath(null);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  function moveOid(
    nodes: TemplateNode[],
    oid: string,
    direction: 'up' | 'down'
  ): TemplateNode[] | null {
    const idx = nodes.findIndex((n) => n.oid === oid);
    if (idx !== -1) {
      const to = direction === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= nodes.length) return null;
      const next = [...nodes];
      const [moved] = next.splice(idx, 1);
      next.splice(to, 0, moved);
      return next;
    }
    for (const n of nodes) {
      if (!n.children) continue;
      const moved = moveOid(n.children, oid, direction);
      if (moved) return nodes.map((c) => (c === n ? { ...n, children: moved } : c));
    }
    return null;
  }

  const moveNode = useCallback(
    (blockId: string, oid: string, direction: 'up' | 'down') => {
      const nextBlocks = layout.blocks.map((b) => {
        if (b.id !== blockId) return b;
        if (b.nodes) {
          const moved = moveOid(b.nodes, oid, direction);
          if (moved) return { ...b, nodes: moved };
        }
        if (b.slots) {
          let changed = false;
          const slots: Record<string, TemplateNode[]> = {};
          for (const [k, v] of Object.entries(b.slots)) {
            const moved = moveOid(v, oid, direction);
            if (moved) {
              changed = true;
              slots[k] = moved;
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

  // Les archétypes sont des presets d'accueil : appliqués au scope home.
  const selectArchetype = useCallback((archetypeId: string) => {
    const target = ARCHETYPES_REGISTRY[archetypeId];
    if (!target) return;
    pageRef.current = 'home';
    setStagePageState('home');
    setScoped((prev) => ({
      ...prev,
      home: {
        ...prev.home,
        archetype: target.archetype,
        tokens: { ...target.tokens },
        blocks: target.blocks.map((b) => ({ ...b, id: `${b.id}_${Date.now()}` })),
      },
    }));
    setSelectedBlockId(null);
    setSelectedOid(null);
    setSelectedPath(null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(true);
  }, []);

  const selectedNode = useMemo(() => {
    if (!selectedOid || !selectedBlock) return null;
    return findNode(selectedBlock, selectedOid);
  }, [selectedOid, selectedBlock, layout.blocks]);

  const toggleHiddenAt = useCallback(
    (id: string, device: 'mobile' | 'tablet') => {
      setPast((prev) => [...prev.slice(-49), layout]);
      setFuture([]);
      setLayout({
        ...layout,
        blocks: layout.blocks.map((b) => {
          if (b.id !== id) return b;
          const current = b.hiddenAt ?? [];
          const next = current.includes(device)
            ? current.filter((d) => d !== device)
            : [...current, device];
          return { ...b, hiddenAt: next.length > 0 ? next : undefined };
        }),
      });
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const applyArticleVariant = useCallback((variantId: string) => {
    const variant = ARTICLE_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;
    pageRef.current = 'article';
    setStagePageState('article');
    setScoped((prev) => ({
      ...prev,
      article: {
        ...variant.config,
        tokens: { ...prev.home.tokens },
        blocks: variant.config.blocks.map((b) => ({ ...b, id: `${b.id}_${Date.now()}` })),
      },
    }));
    setSelectedBlockId(null);
    setSelectedOid(null);
    setSelectedPath(null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(true);
  }, []);

  // ── Versions locales (points de restauration, sans backend) ──
  const [snapshots, setSnapshots] = useState<StageSnapshot[]>(() => readSnapshots(publication.id));

  const persistSnapshots = useCallback(
    (next: StageSnapshot[]) => {
      setSnapshots(next);
      try {
        window.localStorage.setItem(snapshotKey(publication.id), JSON.stringify(next));
      } catch {
        // Stockage indisponible : versions en mémoire seule.
      }
    },
    [publication.id]
  );

  const saveSnapshot = useCallback(
    (name?: string) => {
      const at = Date.now();
      const entry: StageSnapshot = {
        id: `snap_${at}`,
        name: name || `Version ${new Date(at).toLocaleString('fr-FR')}`,
        at,
        page: pageRef.current,
        layout: JSON.parse(JSON.stringify(layout)) as LayoutConfig,
      };
      persistSnapshots([entry, ...snapshots].slice(0, SNAPSHOT_CAP));
    },
    [layout, snapshots, persistSnapshots]
  );

  const restoreSnapshot = useCallback(
    (id: string) => {
      const snap = snapshots.find((s) => s.id === id);
      if (!snap) return;
      pageRef.current = snap.page;
      setStagePageState(snap.page);
      setScoped((prev) => ({ ...prev, [snap.page]: snap.layout }));
      setSelectedBlockId(null);
      setSelectedOid(null);
      setSelectedPath(null);
      setPast([]);
      setFuture([]);
      setHasUnsavedChanges(true);
    },
    [snapshots]
  );

  const deleteSnapshot = useCallback(
    (id: string) => {
      persistSnapshots(snapshots.filter((s) => s.id !== id));
    },
    [snapshots, persistSnapshots]
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
      const payload = serializeSiteLayouts(scoped.home, scoped.article);
      const res = await fetch('/api/settings/publication', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationId: publication.id,
          layoutStyle: payload,
        }),
      });
      if (!res.ok) {
        const pubId = publication.id || '';
        await fetch(`/v1/settings/publication?publicationId=${encodeURIComponent(pubId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicationId: pubId,
            layoutStyle: payload,
          }),
        }).catch(() => null);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Erreur sauvegarde Stage :', err);
    } finally {
      setIsSaving(false);
    }
  }, [scoped, publication.id]);

  const value = useMemo<StageEngineContextType>(
    () => ({
      layout,
      stagePage,
      setStagePage,
      applyArticleVariant,
      toggleHiddenAt,
      snapshots,
      saveSnapshot,
      restoreSnapshot,
      deleteSnapshot,
      publication,
      articles,
      selectedBlockId,
      selectedBlock,
      selectedOid,
      selectedPath,
      selectedNode,
      selectBlock,
      selectNode,
      updateBlockProps,
      updateNode,
      addNode,
      removeNode,
      moveNode,
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
      stagePage,
      setStagePage,
      applyArticleVariant,
      toggleHiddenAt,
      snapshots,
      saveSnapshot,
      restoreSnapshot,
      deleteSnapshot,
      publication,
      articles,
      selectedBlockId,
      selectedBlock,
      selectedOid,
      selectedPath,
      selectedNode,
      selectBlock,
      selectNode,
      updateBlockProps,
      updateNode,
      addNode,
      removeNode,
      moveNode,
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
