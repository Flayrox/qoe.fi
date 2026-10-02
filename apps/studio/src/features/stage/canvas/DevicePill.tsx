// DevicePill.tsx — sélecteur de format façon Figma, flottant au-dessus de l'artboard

'use client';

import React from 'react';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { useStageEngine } from '../context/StageEngineContext';
import { DEVICE_DIMENSIONS, type StageDevice } from '../types';

const ORDER: StageDevice[] = ['desktop', 'tablet', 'mobile'];

export function DevicePill() {
  const engine = useStageEngine();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur-md">
      {ORDER.map((d) => {
        const active = engine.device === d;
        const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
        return (
          <button
            key={d}
            type="button"
            onClick={() => engine.setDevice(d)}
            title={`${DEVICE_DIMENSIONS[d].label} · ${DEVICE_DIMENSIONS[d].width}px`}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors ${
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{DEVICE_DIMENSIONS[d].width}</span>
          </button>
        );
      })}
    </div>
  );
}
