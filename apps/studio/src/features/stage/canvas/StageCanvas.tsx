// =====================================================================
// StageCanvas.tsx — Workbench infini
// Ref brute : vendor/onlook/_components/canvas/{index,frames,overlay/*,
// hotkeys,selection-utils,recenter-canvas-button}
// Souverain : DOM direct [data-block-id], clamp souverain, drag-select,
// measurement Alt, snap center, 8 poignées fonctionnelles, hotkeys complets.
// =====================================================================

'use client';

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type {
  LayoutConfig,
  TemplatePublicationContext,
  TemplateArticleItem,
} from '@qoe/ui/templates';
import { TemplateRenderer } from '@qoe/ui/templates';
import type { StageDevice, StageMode, StageCanvasTransform } from '../types';
import { DEVICE_DIMENSIONS } from '../types';
import {
  STAGE_MAX_X,
  STAGE_MAX_Y,
  STAGE_MIN_X,
  STAGE_MIN_Y,
  STAGE_MIN_ZOOM,
  STAGE_MAX_ZOOM,
  STAGE_PAN_SENSITIVITY,
  STAGE_ZOOM_SENSITIVITY,
} from '../engine/constants';
import { useStageEditorEngine } from '../engine';
import { useStageEngine } from '../context/StageEngineContext';
import {
  DragSelectRect,
  HoverRect,
  MeasurementOverlay,
  RecenterButton,
  SelectedRect,
  SnapOverlay,
} from './overlay/StageOverlays';
import { useStageHotkeys } from './useStageHotkeys';
import { StageEditorMode } from '../engine/models';

interface StageCanvasProps {
  layout: LayoutConfig;
  publication: TemplatePublicationContext;
  articles: TemplateArticleItem[];
  device: StageDevice;
  mode: StageMode;
  transform: StageCanvasTransform;
  onTransformChange: (transform: StageCanvasTransform) => void;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onDeleteBlock: (id: string) => void;
}

function clampTransform(t: StageCanvasTransform): StageCanvasTransform {
  const scale = Math.min(Math.max(t.scale, STAGE_MIN_ZOOM), STAGE_MAX_ZOOM);
  return {
    scale,
    x: Math.min(Math.max(t.x, STAGE_MIN_X * scale), STAGE_MAX_X * scale),
    y: Math.min(Math.max(t.y, STAGE_MIN_Y * scale), STAGE_MAX_Y * scale),
  };
}

export function StageCanvas({
  layout,
  publication,
  articles,
  device,
  mode,
  transform,
  onTransformChange,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onDeleteBlock,
}: StageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const editor = useStageEditorEngine();
  const persistent = useStageEngine();

  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePan, setIsSpacePan] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [drag, setDrag] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const [artboardOutOfView, setArtboardOutOfView] = useState(false);
  const [rectTick, setRectTick] = useState(0);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const resizeRef = useRef<{
    id: string;
    dir: string;
    startX: number;
    startY: number;
    orig: Record<string, number>;
  } | null>(null);

  const deviceWidth = DEVICE_DIMENSIONS[device].width;
  const isPreview = mode === 'preview';

  // ── Mesure des rects [data-block-id] relatifs à l'artboard ──
  // Note : les rects vivent dans editor.frames (mobx, impératif) ; la
  // re-mesure est déclenchée par les effets ci-dessous (layout/device/scale).
  const measureRects = useCallback(() => {
    const art = artboardRef.current;
    if (!art) return;
    const artBox = art.getBoundingClientRect();
    const nodes = art.querySelectorAll('[data-block-id]');
    editor.frames.clearRects();
    nodes.forEach((n) => {
      const el = n as HTMLElement;
      const id = el.getAttribute('data-block-id');
      if (!id) return;
      const r = el.getBoundingClientRect();
      editor.frames.registerRect(id, {
        x: (r.left - artBox.left) / transform.scale,
        y: (r.top - artBox.top) / transform.scale,
        width: r.width / transform.scale,
        height: r.height / transform.scale,
      });
    });
    setRectTick((v) => v + 1);
  }, [editor, transform.scale]);

  useEffect(() => {
    const t = setTimeout(measureRects, 60);
    return () => clearTimeout(t);
  }, [measureRects, layout, deviceWidth]);

  useEffect(() => {
    measureRects();
  }, [layout.blocks.length, deviceWidth, measureRects]);

  // ── Détection artboard hors vue (recenter) ──
  useEffect(() => {
    const container = containerRef.current;
    const art = artboardRef.current;
    if (!container || !art) return;
    const obs = new IntersectionObserver(([entry]) => setArtboardOutOfView(!entry.isIntersecting), {
      root: container,
      threshold: 0,
    });
    obs.observe(art);
    return () => obs.disconnect();
  }, [deviceWidth]);

  // ── Hotkeys Figma complets ──
  useStageHotkeys({
    editorMode:
      persistent.editorMode === 'preview' ? StageEditorMode.PREVIEW : StageEditorMode.DESIGN,
    setEditorMode: (m) =>
      persistent.setEditorMode(
        m === StageEditorMode.PREVIEW ? ('preview' as never) : ('design' as never)
      ),
    undo: persistent.undo,
    redo: persistent.redo,
    resetZoom: persistent.resetZoom,
    duplicateSelected: () => {
      if (selectedBlockId) persistent.duplicateBlock(selectedBlockId);
    },
    deleteSelected: () => {
      if (selectedBlockId) onDeleteBlock(selectedBlockId);
    },
    setSpacePan: setIsSpacePan,
    setShowMeasurement,
  });

  // ── Wheel : zoom ⌘/Ctrl ancré pointeur, sinon pan ──
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      editor.state.setCanvasScrolling(true);
      if (e.ctrlKey || e.metaKey) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = 1 - e.deltaY * STAGE_ZOOM_SENSITIVITY;
        const nextScale = Math.min(
          Math.max(transform.scale * factor, STAGE_MIN_ZOOM),
          STAGE_MAX_ZOOM
        );
        const ratio = nextScale / transform.scale;
        onTransformChange(
          clampTransform({
            scale: nextScale,
            x: mouseX - (mouseX - transform.x) * ratio,
            y: mouseY - (mouseY - transform.y) * ratio,
          })
        );
      } else {
        const dx = (e.deltaX + (e.shiftKey ? e.deltaY : 0)) * STAGE_PAN_SENSITIVITY;
        const dy = (e.shiftKey ? 0 : e.deltaY) * STAGE_PAN_SENSITIVITY;
        onTransformChange(
          clampTransform({ ...transform, x: transform.x - dx, y: transform.y - dy })
        );
      }
    },
    [editor, transform, onTransformChange]
  );

  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    div.addEventListener('wheel', handleWheel, { passive: false });
    return () => div.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || (isSpacePan && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (isPreview) return;
    if (e.target === containerRef.current && e.button === 0) {
      const p = toCanvasPoint(e.clientX, e.clientY);
      setDrag({ start: p, end: p });
      editor.state.isDragSelecting = true;
      if (!e.shiftKey) onSelectBlock(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && lastMousePos.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      onTransformChange(clampTransform({ ...transform, x: transform.x + dx, y: transform.y + dy }));
      return;
    }
    if (drag) {
      setDrag({ ...drag, end: toCanvasPoint(e.clientX, e.clientY) });
      return;
    }
    if (isPreview || e.altKey) return;
    const el = (e.target as HTMLElement).closest?.('[data-block-id]');
    const id = el?.getAttribute('data-block-id') ?? null;
    if (id !== hoverId) {
      setHoverId(id);
      editor.frames.setHover(id);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      lastMousePos.current = null;
    }
    if (drag) {
      const ids = editor.frames.getIdsInSelection(drag.start, drag.end, transform, transform.scale);
      // Filtre le micro-clic (drag < 4px) → traité comme désélection simple
      const dist = Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y);
      if (dist > 4 && ids.length > 0) {
        editor.frames.selectMany(ids);
        onSelectBlock(ids[0] ?? null);
      } else if (e.target === containerRef.current) {
        onSelectBlock(null);
      }
      setDrag(null);
      editor.state.isDragSelecting = false;
    }
  };

  // ── Resize 8 poignées → props.styleBox (padding + maxWidth) ──
  const handleResizeStart = useCallback(
    (dir: string, e: React.MouseEvent) => {
      if (!selectedBlockId) return;
      const block = layout.blocks.find((b) => b.id === selectedBlockId);
      const styleBox = ((block?.props as Record<string, unknown> | undefined)?.styleBox ??
        {}) as Record<string, number>;
      resizeRef.current = {
        id: selectedBlockId,
        dir,
        startX: e.clientX,
        startY: e.clientY,
        orig: {
          pt: Number(styleBox.pt ?? 0),
          pb: Number(styleBox.pb ?? 0),
          maxWidth: Number(styleBox.maxWidth ?? 0),
        },
      };
      const onMove = (ev: MouseEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const dy = (ev.clientY - r.startY) / transform.scale;
        const dx = (ev.clientX - r.startX) / transform.scale;
        const next: Record<string, number> = { ...r.orig };
        if (r.dir.includes('n')) next.pt = Math.max(0, Math.min(240, r.orig.pt + dy));
        if (r.dir.includes('s')) next.pb = Math.max(0, Math.min(240, r.orig.pb + dy));
        if (r.dir.includes('e') || r.dir.includes('w')) {
          const delta = r.dir.includes('e') ? -dx : -dx;
          const base = r.orig.maxWidth || deviceWidth;
          next.maxWidth = Math.max(320, Math.min(deviceWidth, base + delta));
          if (next.maxWidth >= deviceWidth - 2) next.maxWidth = 0; // 0 = plein large
        }
        persistent.updateBlockProps(r.id, { styleBox: next });
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setTimeout(measureRects, 60);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [selectedBlockId, layout.blocks, persistent, transform.scale, deviceWidth, measureRects]
  );

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
      transformOrigin: '0 0',
    }),
    [transform]
  );

  const selectedRect = selectedBlockId ? editor.frames.getRect(selectedBlockId) : undefined;
  void rectTick;
  const hoverRect =
    hoverId && hoverId !== selectedBlockId ? editor.frames.getRect(hoverId) : undefined;
  const selectedLabel =
    layout.blocks.find((b) => b.id === selectedBlockId)?.label ??
    layout.blocks.find((b) => b.id === selectedBlockId)?.type ??
    'Section';

  // Snap : lignes centrales quand la sélection s'aligne au centre de l'artboard
  const snapLines = useMemo(() => {
    if (!selectedRect || !artboardRef.current) return [];
    const out: { orientation: 'h' | 'v'; at: number }[] = [];
    const cx = selectedRect.x + selectedRect.width / 2;
    if (Math.abs(cx - deviceWidth / 2) < 4 / transform.scale) {
      out.push({ orientation: 'v', at: deviceWidth / 2 });
    }
    return out;
  }, [selectedRect, deviceWidth, transform.scale]);

  const artboardBox = { x: 0, y: 0, width: deviceWidth, height: 0 };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHoverId(null);
        if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
        }
      }}
      className={`relative h-full w-full overflow-hidden select-none bg-[#0D0D10] ${
        isSpacePan || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.08) 1px, transparent 0)`,
        backgroundSize: '24px 24px',
      }}
    >
      <div className="absolute top-0 left-0 will-change-transform" style={transformStyle}>
        <div className="flex flex-col items-start gap-2 px-24 pt-16 pb-32">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-[11px] font-medium text-muted-foreground">
            <span>Accueil</span>
            <span className="opacity-40">·</span>
            <span>{deviceWidth} × Auto</span>
            <span className="opacity-40">·</span>
            <span>{Math.round(transform.scale * 100)}%</span>
          </div>

          <div
            ref={artboardRef}
            style={{ width: `${deviceWidth}px` }}
            className={`relative overflow-hidden rounded-lg bg-background text-foreground shadow-md transition-all duration-300 ${
              isPreview ? 'border border-border ring-1 ring-border' : 'border border-border'
            }`}
          >
            <TemplateRenderer
              config={layout}
              publication={publication}
              articles={articles}
              mode={isPreview ? 'live' : 'editable'}
              selectedBlockId={selectedBlockId}
              selectedOid={persistent.selectedOid}
              onSelectBlock={(id) => onSelectBlock(id)}
              onSelectNode={(oid, path, blockId) => persistent.selectNode(oid, path, blockId)}
              onUpdateBlockProps={(blockId, patch) =>
                persistent.updateBlockProps(blockId, patch as Record<string, unknown>)
              }
              onUpdateNode={(blockId, oid, patch) => persistent.updateNode(blockId, oid, patch)}
              onMoveBlock={onMoveBlock}
              onDeleteBlock={onDeleteBlock}
            />
            {!isPreview && (
              <div className="pointer-events-none absolute inset-0">
                {hoverRect && <HoverRect rect={hoverRect} />}
                {selectedRect && (
                  <SelectedRect
                    rect={selectedRect}
                    label={selectedLabel}
                    onResizeStart={handleResizeStart}
                  />
                )}
                {showMeasurement && selectedRect && hoverRect && (
                  <MeasurementOverlay from={selectedRect} to={hoverRect} />
                )}
                {snapLines.length > 0 && <SnapOverlay lines={snapLines} artboard={artboardBox} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {drag && <DragSelectRect start={drag.start} end={drag.end} />}
      {artboardOutOfView && !drag && <RecenterButton onRecenter={persistent.resetZoom} />}
    </div>
  );
}
