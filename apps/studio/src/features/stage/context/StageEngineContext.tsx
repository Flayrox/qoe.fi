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
  parseSiteLayouts,
  serializeSiteLayouts,
} from '@qoe/ui/templates';
import {
  getSiteLayoutDraftAction,
  saveSiteLayoutDraftAction,
  publishSiteLayoutAction,
  listSiteLayoutVersionsAction,
  restoreSiteLayoutVersionAction,
} from '@/app/(creator)/settings/design/actions';

export enum StageEditorMode {
  DESIGN = 'design',
  PAN = 'pan',
  PREVIEW = 'preview',
}

/** Version publiée archivée côté serveur */
export interface StageSnapshot {
  id: string;
  label: string;
  createdAt: string;
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

  // ── Scopes de pages (accueil / article / article par rubrique) ──
  stagePage: 'home' | 'article';
  setStagePage: (page: 'home' | 'article') => void;
  articleCategory: string | null;
  setArticleCategory: (slug: string | null) => void;
  applyArticleVariant: (variantId: string) => void;
  toggleHiddenAt: (id: string, device: 'mobile' | 'tablet') => void;

  // ── Versions serveur (instantanés publiés) ──
  snapshots: StageSnapshot[];
  snapshotsLoading: boolean;
  loadSnapshots: () => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;

  // ── Publication (brouillon → en ligne) ──
  unpublished: boolean;
  isPublishing: boolean;
  publish: () => Promise<void>;

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
  saveError: string | null;
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
  initialOverrides,
  initialUnpublished,
  publication,
  articles,
}: {
  children: React.ReactNode;
  initialLayout: LayoutConfig;
  initialArticleLayout: LayoutConfig | null;
  initialOverrides: Record<string, LayoutConfig>;
  initialUnpublished: boolean;
  publication: TemplatePublicationContext;
  articles: TemplateArticleItem[];
}) {
  const [scoped, setScoped] = useState<{ home: LayoutConfig; article: LayoutConfig | null }>({
    home: initialLayout,
    article: initialArticleLayout,
  });
  const [overrides, setOverrides] = useState<Record<string, LayoutConfig>>(initialOverrides);
  const [stagePage, setStagePageState] = useState<'home' | 'article'>('home');
  const [articleCategory, setArticleCategoryState] = useState<string | null>(null);
  const targetRef = useRef<{ page: 'home' | 'article'; category: string | null }>({
    page: 'home',
    category: null,
  });
  // Compat : pageRef historique (page seule).
  const pageRef = {
    get current() {
      return targetRef.current.page;
    },
    set current(page: 'home' | 'article') {
      targetRef.current = { page, category: null };
    },
  };
  const [past, setPast] = useState<LayoutConfig[]>([]);
  const [future, setFuture] = useState<LayoutConfig[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [unpublished, setUnpublished] = useState(initialUnpublished);
  const [snapshots, setSnapshots] = useState<StageSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

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

  // Layout actif : accueil, article, ou override de rubrique.
  // L'historique est volontairement réinitialisé au changement de cible.
  const layout =
    stagePage === 'home'
      ? scoped.home
      : articleCategory && overrides[articleCategory]
        ? overrides[articleCategory]
        : (scoped.article ?? scoped.home);
  const setLayout = useCallback((next: LayoutConfig | ((prev: LayoutConfig) => LayoutConfig)) => {
    const target = { ...targetRef.current };
    if (target.page === 'home' || !target.category) {
      const page = target.page;
      setScoped((prev) => {
        const current = prev[page] ?? prev.home;
        const resolved =
          typeof next === 'function' ? (next as (p: LayoutConfig) => LayoutConfig)(current) : next;
        return { ...prev, [page]: resolved };
      });
    } else {
      const slug = target.category as string;
      setOverrides((prev) => {
        const current = prev[slug];
        if (!current) return prev;
        const resolved =
          typeof next === 'function' ? (next as (p: LayoutConfig) => LayoutConfig)(current) : next;
        return { ...prev, [slug]: resolved };
      });
    }
  }, []);

  const clearEditingState = useCallback(() => {
    setSelectedBlockId(null);
    setSelectedOid(null);
    setSelectedPath(null);
    setPast([]);
    setFuture([]);
  }, []);

  const setArticleCategory = useCallback(
    (slug: string | null) => {
      targetRef.current = { page: 'article', category: slug };
      setStagePageState('article');
      setArticleCategoryState(slug);
      if (slug) {
        setOverrides((prev) => {
          if (prev[slug]) return prev;
          const base =
            scoped.article ?? (JSON.parse(JSON.stringify(ARTICLE_DEFAULT_CONFIG)) as LayoutConfig);
          return {
            ...prev,
            [slug]: JSON.parse(JSON.stringify(base)) as LayoutConfig,
          };
        });
        setHasUnsavedChanges(true);
      }
      clearEditingState();
    },
    [scoped.article, clearEditingState]
  );

  const setStagePage = useCallback(
    (page: 'home' | 'article') => {
      targetRef.current = { page, category: null };
      setStagePageState(page);
      setArticleCategoryState(null);
      clearEditingState();
      if (page === 'article') {
        setScoped((prev) =>
          prev.article
            ? prev
            : {
                ...prev,
                article: JSON.parse(JSON.stringify(ARTICLE_DEFAULT_CONFIG)) as LayoutConfig,
              }
        );
        setHasUnsavedChanges(true);
      }
    },
    [clearEditingState]
  );

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

  const applyArticleVariant = useCallback(
    (variantId: string) => {
      const variant = ARTICLE_VARIANTS.find((v) => v.id === variantId);
      if (!variant) return;
      const build = (tokens: LayoutConfig['tokens']): LayoutConfig => ({
        ...variant.config,
        tokens: { ...tokens },
        blocks: variant.config.blocks.map((b) => ({ ...b, id: `${b.id}_${Date.now()}` })),
      });
      const target = { ...targetRef.current, page: 'article' as const };
      targetRef.current = target;
      setStagePageState('article');
      if (target.category) {
        const slug = target.category;
        setOverrides((prev) => ({
          ...prev,
          [slug]: build(prev[slug]?.tokens ?? scoped.home.tokens),
        }));
      } else {
        setScoped((prev) => ({
          ...prev,
          article: build(prev.home.tokens),
        }));
      }
      setSelectedBlockId(null);
      setSelectedOid(null);
      setSelectedPath(null);
      setPast([]);
      setFuture([]);
      setHasUnsavedChanges(true);
    },
    [scoped.home.tokens]
  );

  // ── Versions serveur (instantanés publiés) ──
  const loadSnapshots = useCallback(async () => {
    const pubId = publication.id;
    if (!pubId) return;
    setSnapshotsLoading(true);
    try {
      const res = await listSiteLayoutVersionsAction(pubId);
      if (!res.success) return;
      setSnapshots(res.versions as StageSnapshot[]);
    } catch {
      // Backend indisponible : pas de versions.
    } finally {
      setSnapshotsLoading(false);
    }
  }, [publication.id]);

  const applyScopesPayload = useCallback((payload: string) => {
    try {
      const parsed = parseSiteLayouts(payload);
      setScoped({ home: parsed.home, article: parsed.article });
      setOverrides(parsed.articleByCategory);
      setSelectedBlockId(null);
      setSelectedOid(null);
      setSelectedPath(null);
      setPast([]);
      setFuture([]);
      setHasUnsavedChanges(true);
    } catch {
      // Payload illisible : on ne touche à rien.
    }
  }, []);

  const restoreSnapshot = useCallback(
    async (id: string) => {
      const pubId = publication.id;
      if (!pubId) return;
      try {
        const res = await restoreSiteLayoutVersionAction(pubId, id);
        if (!res.success) return;
        const draftRes = await getSiteLayoutDraftAction(pubId);
        if (!draftRes.success || !draftRes.layout) return;
        applyScopesPayload(draftRes.layout);
        setUnpublished(true);
      } catch {
        // Restauration impossible : état local inchangé.
      }
    },
    [publication.id, applyScopesPayload]
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

  // ── Sauvegarde (brouillon) puis publication ──
  // Enregistrer = brouillon serveur (le site public ne change pas).
  // Publier = bascule du brouillon en ligne + snapshot de l'ancienne version.
  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload = serializeSiteLayouts(scoped.home, scoped.article, overrides);
      const pubId = publication.id || '';
      const res = await saveSiteLayoutDraftAction(pubId, payload);
      if (!res.success) {
        setSaveError(res.error ?? 'Enregistrement impossible');
        return;
      }
      setSaveError(null);
      setUnpublished(true);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Erreur sauvegarde Stage :', err);
    } finally {
      setIsSaving(false);
    }
  }, [scoped, publication.id]);

  const publish = useCallback(async () => {
    const pubId = publication.id;
    if (!pubId) return;
    setIsPublishing(true);
    try {
      const res = await publishSiteLayoutAction(pubId);
      if (!res.success) {
        setSaveError(res.error ?? 'Publication impossible');
        return;
      }
      setSaveError(null);
      setUnpublished(false);
      setHasUnsavedChanges(false);
      await loadSnapshots();
    } catch (err) {
      console.error('Erreur publication Stage :', err);
    } finally {
      setIsPublishing(false);
    }
  }, [publication.id, loadSnapshots]);

  const value = useMemo<StageEngineContextType>(
    () => ({
      layout,
      stagePage,
      setStagePage,
      articleCategory,
      setArticleCategory,
      applyArticleVariant,
      toggleHiddenAt,
      snapshots,
      snapshotsLoading,
      loadSnapshots,
      restoreSnapshot,
      unpublished,
      isPublishing,
      publish,
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
      saveError,
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
      articleCategory,
      setArticleCategory,
      applyArticleVariant,
      toggleHiddenAt,
      snapshots,
      snapshotsLoading,
      loadSnapshots,
      restoreSnapshot,
      unpublished,
      isPublishing,
      publish,
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
      saveError,
      hasUnsavedChanges,
      save,
      isSidebarOpen,
      leftPanelTab,
      leftPanelLocked,
    ]
  );

  return <StageEngineContext.Provider value={value}>{children}</StageEngineContext.Provider>;
}
