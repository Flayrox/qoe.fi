// =====================================================================
// StageOverlays — overlay canvas
// Ref brute : vendor/onlook/_components/canvas/overlay/elements/rect/*,
// measurement.tsx, snap-guidelines.tsx, drag-select.tsx, recenter button.
// Souverain : DOM direct [data-block-id], pas de penpal/iframe.
// =====================================================================

'use client';

import React from 'react';
import { Crosshair } from 'lucide-react';
import type { StageRect } from '../../engine/models';

export function HoverRect({ rect }: { rect: StageRect }) {
  return (
    <div
      className="pointer-events-none absolute z-30 rounded-[2px]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        boxShadow: 'inset 0 0 0 1px hsl(var(--primary) / 0.65)',
      }}
    />
  );
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function SelectedRect({
  rect,
  label,
  onResizeStart,
}: {
  rect: StageRect;
  label: string;
  onResizeStart: (dir: ResizeDir, e: React.MouseEvent) => void;
}) {
  const handleStyle =
    'absolute w-2 h-2 rounded-[2px] bg-background border border-primary shadow-sm z-40';
  const cursors: Record<ResizeDir, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  };
  const positions: Record<ResizeDir, string> = {
    n: '-top-1 left-1/2 -translate-x-1/2',
    s: '-bottom-1 left-1/2 -translate-x-1/2',
    e: 'top-1/2 -right-1 -translate-y-1/2',
    w: 'top-1/2 -left-1 -translate-y-1/2',
    ne: '-top-1 -right-1',
    nw: '-top-1 -left-1',
    se: '-bottom-1 -right-1',
    sw: '-bottom-1 -left-1',
  };

  return (
    <div
      className="pointer-events-none absolute z-30 rounded-[2px]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        boxShadow: 'inset 0 0 0 2px hsl(var(--primary))',
      }}
    >
      <div className="absolute -top-6 left-0 flex items-center gap-1.5 rounded-md bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background shadow-sm">
        <span>{label}</span>
        <span className="font-mono font-normal opacity-80">
          {Math.round(rect.width)}×{Math.round(rect.height)}
        </span>
      </div>
      {(Object.keys(positions) as ResizeDir[]).map((dir) => (
        <div
          key={dir}
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(dir, e);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`pointer-events-auto ${handleStyle} ${positions[dir]}`}
          style={{ cursor: cursors[dir] }}
        />
      ))}
    </div>
  );
}

export function MeasurementOverlay({ from, to }: { from: StageRect; to: StageRect }) {
  // Distance verticale + horizontale entre deux rects (style Figma rouge)
  const vGap =
    to.y >= from.y + from.height
      ? { y: from.y + from.height, h: to.y - (from.y + from.height), x: Math.min(from.x, to.x) + 8 }
      : from.y >= to.y + to.height
        ? { y: to.y + to.height, h: from.y - (to.y + to.height), x: Math.min(from.x, to.x) + 8 }
        : null;
  const hGap =
    to.x >= from.x + from.width
      ? { x: from.x + from.width, w: to.x - (from.x + from.width), y: Math.min(from.y, to.y) + 8 }
      : from.x >= to.x + to.width
        ? { x: to.x + to.width, w: from.x - (to.x + to.width), y: Math.min(from.y, to.y) + 8 }
        : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {vGap && vGap.h > 0 && (
        <>
          <div
            className="absolute w-px bg-destructive"
            style={{ left: vGap.x, top: vGap.y, height: vGap.h }}
          />
          <div
            className="absolute flex h-5 w-10 items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-mono font-bold text-destructive-foreground"
            style={{ left: vGap.x - 20, top: vGap.y + vGap.h / 2 - 10 }}
          >
            {Math.round(vGap.h)}
          </div>
        </>
      )}
      {hGap && hGap.w > 0 && (
        <>
          <div
            className="absolute h-px bg-destructive"
            style={{ top: hGap.y, left: hGap.x, width: hGap.w }}
          />
          <div
            className="absolute flex h-5 w-10 items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-mono font-bold text-destructive-foreground"
            style={{ left: hGap.x + hGap.w / 2 - 20, top: hGap.y - 10 }}
          >
            {Math.round(hGap.w)}
          </div>
        </>
      )}
    </div>
  );
}

export function SnapOverlay({
  lines,
  artboard,
}: {
  lines: { orientation: 'h' | 'v'; at: number }[];
  artboard: StageRect;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {lines.map((l, i) =>
        l.orientation === 'v' ? (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-destructive"
            style={{ left: l.at - artboard.x }}
          />
        ) : (
          <div
            key={i}
            className="absolute left-0 w-full bg-destructive"
            style={{ top: l.at - artboard.y, height: 1 }}
          />
        )
      )}
    </div>
  );
}

export function DragSelectRect({
  start,
  end,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
}) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-[1px] border border-primary bg-primary/10"
      style={{ left: x, top: y, width: w, height: h }}
    />
  );
}

export function RecenterButton({ onRecenter }: { onRecenter: () => void }) {
  return (
    <button
      type="button"
      onClick={onRecenter}
      className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background/95 px-3.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors hover:bg-muted"
    >
      <Crosshair className="h-3.5 w-3.5 text-muted-foreground" />
      <span>Recentrer le canvas</span>
      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⇧0</kbd>
    </button>
  );
}
