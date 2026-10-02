// =====================================================================
// 🎨 StageCanvas.tsx — Workbench Infini & Artboard de Qoefi Stage (Adapté d'Onlook)
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

const ZOOM_SENSITIVITY = 0.005;
const PAN_SENSITIVITY = 0.75;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

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
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  const deviceWidth = DEVICE_DIMENSIONS[device].width;

  // ── 1. Gestion Clavier : Espace pour Pan ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── 2. Gestion Mathématique du Zoom et du Pan (adapté d'Onlook) ──
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centré sur la position de la souris
        const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
        const newScale = Math.min(Math.max(transform.scale * (1 + zoomDelta), MIN_ZOOM), MAX_ZOOM);

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Compensation du décalage pour zoomer vers le pointeur
        const scaleRatio = newScale / transform.scale;
        const newX = mouseX - (mouseX - transform.x) * scaleRatio;
        const newY = mouseY - (mouseY - transform.y) * scaleRatio;

        onTransformChange({
          x: newX,
          y: newY,
          scale: newScale,
        });
      } else {
        // Panning fluide à deux doigts / molette
        const deltaX = (e.deltaX + (e.shiftKey ? e.deltaY : 0)) * PAN_SENSITIVITY;
        const deltaY = (e.shiftKey ? 0 : e.deltaY) * PAN_SENSITIVITY;

        onTransformChange({
          ...transform,
          x: transform.x - deltaX,
          y: transform.y - deltaY,
        });
      }
    },
    [transform, onTransformChange]
  );

  useEffect(() => {
    const div = containerRef.current;
    if (div) {
      div.addEventListener('wheel', handleWheel, { passive: false });
      return () => div.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // ── 3. Panning via clic molette ou Espace + Clic ──
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Bouton molette (1) ou Espace enfoncé avec clic gauche (0)
    if (e.button === 1 || (isSpacePressed && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Clic sur le fond vide du canvas = désélection
    if (e.target === containerRef.current) {
      onSelectBlock(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !lastMousePos.current) return;

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    onTransformChange({
      ...transform,
      x: transform.x + dx,
      y: transform.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    lastMousePos.current = null;
  };

  // ── 4. Style de transformation matricielle ──
  const transformStyle = useMemo(
    () => ({
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
      transformOrigin: '0 0',
    }),
    [transform]
  );

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`relative w-full h-full overflow-hidden select-none bg-[#0D0D10] ${
        isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.08) 1px, transparent 0)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Conteneur transformé du Workbench */}
      <div
        className="absolute top-0 left-0 transition-transform duration-75 ease-out will-change-transform"
        style={transformStyle}
      >
        {/* Cadre Artboard */}
        <div className="flex flex-col items-start gap-2 pt-16 pb-32 px-24">
          {/* Badge Supérieur de l'Artboard (# Accueil · 1280 × Auto) */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium text-white/50 bg-white/5 border border-white/10 backdrop-blur-md">
            <span className="text-primary font-semibold">#</span>
            <span>Accueil</span>
            <span className="opacity-40">·</span>
            <span>{deviceWidth} × Auto</span>
            {mode === 'preview' && (
              <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold bg-primary/20 text-primary">
                Aperçu Direct
              </span>
            )}
          </div>

          {/* Corps de l'Artboard */}
          <div
            style={{ width: `${deviceWidth}px` }}
            className={`relative bg-background text-foreground transition-all duration-300 rounded-xl shadow-2xl border border-white/10 overflow-hidden ${
              mode === 'preview' ? 'ring-2 ring-primary/40' : 'ring-1 ring-white/15'
            }`}
          >
            <TemplateRenderer
              config={layout}
              publication={publication}
              articles={articles}
              mode={mode === 'preview' ? 'live' : 'editable'}
              selectedBlockId={selectedBlockId}
              onSelectBlock={(id) => onSelectBlock(id)}
              onMoveBlock={onMoveBlock}
              onDeleteBlock={onDeleteBlock}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
