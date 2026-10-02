// =====================================================================
// 🧱 Inputs souverains (portés d'Onlook inputs/* : range, spacing, dropdown)
// =====================================================================

'use client';

import React, { useState } from 'react';

export function InputRange({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-primary"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== '') {
            const n = Number(draft);
            if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(Math.min(max, value + (e.shiftKey ? step * 10 : step)));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(Math.max(min, value - (e.shiftKey ? step * 10 : step)));
          }
        }}
        className="w-12 rounded-md border border-border/60 bg-muted/50 px-1 py-0.5 text-right font-mono text-[11px]"
      />
    </div>
  );
}

export function SpacingInputs({
  title,
  values,
  onSide,
  corners = false,
}: {
  title: string;
  values: { top: number; right: number; bottom: number; left: number };
  onSide: (side: 'top' | 'right' | 'bottom' | 'left' | 'all', v: number) => void;
  corners?: boolean;
}) {
  const Cell = ({ side, k }: { side: 'top' | 'right' | 'bottom' | 'left'; k: string }) => (
    <label className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-1 py-0.5">
      <span className="text-[9px] text-muted-foreground">{k}</span>
      <input
        type="number"
        min={0}
        max={corners ? 64 : 240}
        value={values[side] ?? 0}
        onChange={(e) => onSide(side, Math.max(0, Number(e.target.value) || 0))}
        className="w-9 bg-transparent text-right font-mono text-[11px] outline-none"
      />
    </label>
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">{title}</span>
        <button
          type="button"
          onClick={() => {
            const avg = Math.round((values.top + values.right + values.bottom + values.left) / 4);
            onSide('all', avg);
          }}
          className="text-[10px] text-primary hover:underline"
          title="Uniformiser (moyenne)"
        >
          Tous
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Cell side="top" k={corners ? '↖' : '↑'} />
        <Cell side="right" k={corners ? '↗' : '→'} />
        <Cell side="bottom" k={corners ? '↘' : '↓'} />
        <Cell side="left" k={corners ? '↙' : '←'} />
      </div>
    </div>
  );
}

export function InputRadio<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title ?? o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
            value === o.value
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const presets = ['#EE4B2B', '#111111', '#6B7280', '#FFFFFF', '#2563EB', '#16A34A', '#F59E0B'];
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <label
          className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-border shadow-sm"
          style={{ backgroundColor: value || 'transparent' }}
          title="Choisir"
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#EE4B2B'}
            onChange={(e) => onChange(e.target.value)}
            className="h-0 w-0 opacity-0"
          />
        </label>
        <input
          type="text"
          value={value || ''}
          placeholder="#EE4B2B"
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-border/60 bg-muted/50 px-1.5 py-1 font-mono text-[11px] uppercase"
        />
        <div className="flex items-center gap-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className="h-5 w-5 rounded border border-border/60 shadow-sm"
              style={{ backgroundColor: p }}
              title={p}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
