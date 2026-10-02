// =====================================================================
// 🎭 StageClient.tsx — Orchestrateur Central de Qoefi Stage
// =====================================================================

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type {
  LayoutConfig,
  BlockType,
  TemplateBlock,
  TemplateArchetypeId,
} from '@qoe/ui/templates';
import { parseLayoutConfig, serializeLayoutConfig, ARCHETYPES_REGISTRY } from '@qoe/ui/templates';
import { TopBar } from './top-bar/TopBar';
import { StageCanvas } from './canvas/StageCanvas';
import { LeftPanel } from './left-panel/LeftPanel';
import { RightPanel } from './right-panel/RightPanel';
import { SidebarDrawer } from './sidebar-drawer/SidebarDrawer';
import type {
  StageClientProps,
  StageDevice,
  StageMode,
  StageLeftTab,
  StageCanvasTransform,
} from './types';

export function StageClient({ publication, articles, sidebarProps }: StageClientProps) {
  // ── 1. État Initial du Layout (Auto-healing) ──
  const initialLayout = useRef<LayoutConfig>(
    parseLayoutConfig(publication.layoutStyle || 'magazine')
  ).current;

  const [layout, setLayout] = useState<LayoutConfig>(initialLayout);
  const [past, setPast] = useState<LayoutConfig[]>([]);
  const [future, setFuture] = useState<LayoutConfig[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── 2. États de l'Atelier ──
  const [device, setDevice] = useState<StageDevice>('desktop');
  const [mode, setMode] = useState<StageMode>('design');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeLeftTab, setActiveLeftTab] = useState<StageLeftTab>('layers');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── 3. Matrice de Transformation Canvas ──
  const [transform, setTransform] = useState<StageCanvasTransform>({
    x: 60,
    y: 20,
    scale: 0.95,
  });

  // ── 4. Gestionnaire d'Historique (Undo / Redo) ──
  const pushState = useCallback(
    (newLayout: LayoutConfig) => {
      setPast((prev) => [...prev.slice(-30), layout]);
      setFuture([]);
      setLayout(newLayout);
      setHasUnsavedChanges(true);
    },
    [layout]
  );

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [layout, ...prev]);
    setLayout(previous);
    setHasUnsavedChanges(true);
  }, [past, layout]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, layout]);
    setLayout(next);
    setHasUnsavedChanges(true);
  }, [future, layout]);

  // Raccourcis Clavier Globaux (⌘Z, ⌘⇧Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ── 5. Actions sur les Blocs ──
  const handleSelectBlock = (id: string | null) => {
    setSelectedBlockId(id);
    if (id && activeLeftTab !== 'layers') {
      setActiveLeftTab('layers');
    }
  };

  const handleMoveBlock = (id: string, direction: 'up' | 'down') => {
    const index = layout.blocks.findIndex((b: TemplateBlock) => b.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === layout.blocks.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newBlocks = [...layout.blocks];
    const [moved] = newBlocks.splice(index, 1);
    newBlocks.splice(targetIndex, 0, moved);

    pushState({
      ...layout,
      blocks: newBlocks,
    });
  };

  const handleDeleteBlock = (id: string) => {
    const newBlocks = layout.blocks.filter((b: TemplateBlock) => b.id !== id);
    if (selectedBlockId === id) setSelectedBlockId(null);
    pushState({
      ...layout,
      blocks: newBlocks,
    });
  };

  const handleToggleVisibility = (id: string) => {
    const newBlocks = layout.blocks.map((b: TemplateBlock) =>
      b.id === id ? { ...b, visible: !b.visible } : b
    );
    pushState({
      ...layout,
      blocks: newBlocks,
    });
  };

  const handleAddBlock = (type: BlockType) => {
    const newId = `block_${type}_${Date.now()}`;
    const newBlock: TemplateBlock = {
      id: newId,
      type,
      label: type,
      visible: true,
      locked: false,
      props: {},
    };

    // Insérer avant le footer si présent, sinon à la fin
    const footerIndex = layout.blocks.findIndex((b: TemplateBlock) => b.type === 'footer');
    const newBlocks = [...layout.blocks];
    if (footerIndex !== -1) {
      newBlocks.splice(footerIndex, 0, newBlock);
    } else {
      newBlocks.push(newBlock);
    }

    pushState({
      ...layout,
      blocks: newBlocks,
    });
    setSelectedBlockId(newId);
    setActiveLeftTab('layers');
  };

  const handleDuplicateBlock = (id: string) => {
    const index = layout.blocks.findIndex((b: TemplateBlock) => b.id === id);
    if (index === -1) return;
    const original = layout.blocks[index];
    const duplicateId = `${original.type}_${Date.now()}`;
    const duplicatedBlock: TemplateBlock = {
      ...original,
      id: duplicateId,
      props: { ...(original.props as Record<string, unknown>) },
    };

    const newBlocks = [...layout.blocks];
    newBlocks.splice(index + 1, 0, duplicatedBlock);

    pushState({
      ...layout,
      blocks: newBlocks,
    });
    setSelectedBlockId(duplicateId);
  };

  const handleUpdateBlockProps = (id: string, newProps: Record<string, unknown>) => {
    const newBlocks = layout.blocks.map((b: TemplateBlock) =>
      b.id === id ? { ...b, props: { ...(b.props as Record<string, unknown>), ...newProps } } : b
    );
    pushState({
      ...layout,
      blocks: newBlocks,
    });
  };

  const handleSelectArchetype = (archetypeId: TemplateArchetypeId) => {
    const targetArch = ARCHETYPES_REGISTRY[archetypeId];
    if (!targetArch) return;

    pushState({
      ...layout,
      archetype: targetArch.archetype,
      tokens: { ...targetArch.tokens },
      blocks: targetArch.blocks.map((b: TemplateBlock) => ({
        ...b,
        id: `${b.id}_${Date.now()}`,
      })),
    });
  };

  const handleUpdateTokens = (tokens: Partial<LayoutConfig['tokens']>) => {
    pushState({
      ...layout,
      tokens: {
        ...layout.tokens,
        ...tokens,
      },
    });
  };

  // ── 6. Contrôles de Zoom ──
  const handleZoomIn = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale + 0.15, 2.5),
    }));
  };

  const handleZoomOut = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale - 0.15, 0.2),
    }));
  };

  const handleResetZoom = () => {
    setTransform({
      x: 60,
      y: 20,
      scale: 0.95,
    });
  };

  // ── 7. Enregistrement & Publication ──
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const serialized = serializeLayoutConfig(layout);
      const res = await fetch('/api/settings/publication', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationId: publication.id,
          layoutStyle: serialized,
        }),
      });

      if (!res.ok) {
        // Fallback endpoint si nécessaire
        const pubId = publication.id || '';
        await fetch(`/v1/settings/publication?publicationId=${encodeURIComponent(pubId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicationId: pubId,
            layoutStyle: serialized,
          }),
        }).catch(() => null);
      }

      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Erreur sauvegarde Stage :', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col bg-background overflow-hidden z-50">
      {/* ── TopBar 40px Épurée ── */}
      <TopBar
        publicationName={publication.name || 'Publication'}
        domain={publication.domain || 'nom.qoe.fi'}
        device={device}
        onDeviceChange={setDevice}
        mode={mode}
        onModeChange={setMode}
        scale={transform.scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onToggleSidebar={() => setIsSidebarOpen(true)}
      />

      {/* ── Espace Workbench Infini & Panneaux Flottants ── */}
      <main className="relative flex-1 w-full h-[calc(100vh-40px)] overflow-hidden">
        {/* Canvas Infini */}
        <StageCanvas
          layout={layout}
          publication={publication}
          articles={articles}
          device={device}
          mode={mode}
          transform={transform}
          onTransformChange={setTransform}
          selectedBlockId={selectedBlockId}
          onSelectBlock={handleSelectBlock}
          onMoveBlock={handleMoveBlock}
          onDeleteBlock={handleDeleteBlock}
        />

        {/* Panneau Flottant Gauche (Calques / Blocs / Thème) */}
        {mode === 'design' && (
          <div className="absolute top-4 left-4 z-40 max-h-[calc(100%-32px)] flex">
            <LeftPanel
              layout={layout}
              selectedBlockId={selectedBlockId}
              onSelectBlock={handleSelectBlock}
              onMoveBlock={handleMoveBlock}
              onDeleteBlock={handleDeleteBlock}
              onToggleVisibility={handleToggleVisibility}
              onAddBlock={handleAddBlock}
              onSelectArchetype={handleSelectArchetype}
              onUpdateTokens={handleUpdateTokens}
              activeTab={activeLeftTab}
              onTabChange={setActiveLeftTab}
            />
          </div>
        )}

        {/* Panneau Flottant Droit (Inspecteur) */}
        {mode === 'design' && (
          <div className="absolute top-4 right-4 z-40 max-h-[calc(100%-32px)] flex">
            <RightPanel
              layout={layout}
              selectedBlockId={selectedBlockId}
              onUpdateBlockProps={handleUpdateBlockProps}
              onDuplicateBlock={handleDuplicateBlock}
              onDeleteBlock={handleDeleteBlock}
              onSelectBlock={handleSelectBlock}
            />
          </div>
        )}
      </main>

      {/* ── Tiroir Latéral avec le Vrai <Sidebar /> de @qoe/ui/sidebar ── */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sidebarProps={sidebarProps}
      />
    </div>
  );
}
