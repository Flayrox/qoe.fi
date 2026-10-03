// =====================================================================
// StageClient.tsx — Orchestrateur central de Qoefi Stage
// =====================================================================

'use client';

import React, { useRef } from 'react';
import type { LayoutConfig } from '@qoe/ui/templates';
import { parseSiteLayouts } from '@qoe/ui/templates';
import { StageEngineProvider, useStageEngine, StageEditorMode } from './context/StageEngineContext';
import { StageEditorProvider } from './engine';
import { TopBar } from './top-bar/TopBar';
import { StageCanvas } from './canvas/StageCanvas';
import { LeftPanelFull } from './left-panel/LeftPanelFull';
import { RightPanel } from './right-panel/RightPanel';
import { BottomBar } from './bottom-bar/BottomBar';
import { ContextualEditorBar } from './editor-bar/ContextualEditorBar';
import { SidebarDrawer } from './sidebar-drawer/SidebarDrawer';
import type { StageClientProps } from './types';

function StageWorkbench({ sidebarProps }: { sidebarProps?: StageClientProps['sidebarProps'] }) {
  const engine = useStageEngine();

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col bg-background overflow-hidden z-50">
      {/* ── 1. TopBar 40px ── */}
      <TopBar
        publicationName={engine.publication.name || 'Publication'}
        domain={engine.publication.domain || 'nom.qoe.fi'}
        mode={engine.editorMode === StageEditorMode.PREVIEW ? 'preview' : 'design'}
        onModeChange={(m) =>
          engine.setEditorMode(m === 'preview' ? StageEditorMode.PREVIEW : StageEditorMode.DESIGN)
        }
        scale={engine.scale}
        onZoomIn={engine.zoomIn}
        onZoomOut={engine.zoomOut}
        onResetZoom={engine.resetZoom}
        canUndo={engine.canUndo}
        canRedo={engine.canRedo}
        onUndo={engine.undo}
        onRedo={engine.redo}
        onSave={engine.save}
        isSaving={engine.isSaving}
        hasUnsavedChanges={engine.hasUnsavedChanges}
        onToggleSidebar={() => engine.setIsSidebarOpen(true)}
      />

      {/* ── 2. Workbench ── */}
      <main className="relative flex-1 w-full h-[calc(100vh-40px)] overflow-hidden">
        {/* Canvas Infini */}
        <StageCanvas
          layout={engine.layout}
          publication={engine.publication}
          articles={engine.articles}
          device={engine.device}
          mode={engine.editorMode === StageEditorMode.PREVIEW ? 'preview' : 'design'}
          transform={{ x: engine.position.x, y: engine.position.y, scale: engine.scale }}
          onTransformChange={(t) => {
            engine.setPosition({ x: t.x, y: t.y });
            engine.setScale(t.scale);
          }}
          selectedBlockId={engine.selectedBlockId}
          onSelectBlock={engine.selectBlock}
          onMoveBlock={engine.moveBlock}
          onDeleteBlock={engine.deleteBlock}
        />

        {/* Panneau gauche */}
        <LeftPanelFull />

        {/* Barre contextuelle */}
        <ContextualEditorBar />

        {/* Dock bas */}
        <BottomBar />

        {/* Inspecteur droit */}
        {engine.editorMode !== StageEditorMode.PREVIEW && (
          <div className="absolute top-4 right-4 z-40 max-h-[calc(100%-32px)] flex">
            <RightPanel
              layout={engine.layout}
              selectedBlockId={engine.selectedBlockId}
              selectedOid={engine.selectedOid}
              selectedNode={engine.selectedNode}
              onUpdateBlockProps={engine.updateBlockProps}
              onUpdateNode={engine.updateNode}
              onAddNode={engine.addNode}
              onRemoveNode={engine.removeNode}
              onMoveNode={engine.moveNode}
              onSelectNode={(oid, path, blockId) => engine.selectNode(oid, path, blockId)}
              onDuplicateBlock={engine.duplicateBlock}
              onDeleteBlock={engine.deleteBlock}
              onSelectBlock={engine.selectBlock}
            />
          </div>
        )}
      </main>

      {/* ── 3. Tiroir <Sidebar /> ── */}
      <SidebarDrawer
        isOpen={engine.isSidebarOpen}
        onClose={() => engine.setIsSidebarOpen(false)}
        sidebarProps={sidebarProps}
      />
    </div>
  );
}

export function StageClient({ publication, articles, sidebarProps }: StageClientProps) {
  const initialLayouts = useRef(parseSiteLayouts(publication.layoutStyle || 'magazine')).current;
  const initialLayout = useRef<LayoutConfig>(initialLayouts.home).current;
  const initialArticleLayout = useRef(initialLayouts.article).current;

  return (
    <StageEditorProvider>
      <StageEngineProvider
        initialLayout={initialLayout}
        initialArticleLayout={initialArticleLayout}
        publication={publication}
        articles={articles}
      >
        <StageWorkbench sidebarProps={sidebarProps} />
      </StageEngineProvider>
    </StageEditorProvider>
  );
}
