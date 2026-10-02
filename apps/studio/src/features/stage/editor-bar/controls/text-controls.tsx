// =====================================================================
// ✍️ Contrôles typographiques souverains (portés d'Onlook text-inputs/*)
// =====================================================================

'use client';

import { InputRadio, InputRange, ColorField } from './inputs';
import { useQoefiStyle } from '../useQoefiStyle';

const FONT_STACKS = ['Inter', 'Georgia', 'Times New Roman', 'Menlo', 'System UI'];

export function FontControls() {
  const { style, patch } = useQoefiStyle();
  const f = style.font ?? {};
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-[10px] font-medium text-muted-foreground">Police</span>
        <select
          value={f.family ?? 'Inter'}
          onChange={(e) => patch({ font: { ...f, family: e.target.value } })}
          className="w-full rounded-lg border border-border/60 bg-muted/50 px-2 py-1.5 text-xs"
        >
          {FONT_STACKS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <InputRange
        label="Taille"
        value={f.size ?? 16}
        min={10}
        max={96}
        step={1}
        onChange={(v) => patch({ font: { ...f, size: v } })}
      />
      <label className="block space-y-1">
        <span className="text-[10px] font-medium text-muted-foreground">Graisse</span>
        <select
          value={String(f.weight ?? 400)}
          onChange={(e) => patch({ font: { ...f, weight: Number(e.target.value) } })}
          className="w-full rounded-lg border border-border/60 bg-muted/50 px-2 py-1.5 text-xs"
        >
          {[300, 400, 500, 600, 700, 800].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <ColorField
        label="Couleur texte"
        value={f.color ?? ''}
        onChange={(v) => patch({ font: { ...f, color: v } })}
      />
      <InputRadio
        value={f.align ?? 'left'}
        onChange={(v) => patch({ font: { ...f, align: v } })}
        options={[
          { value: 'left', label: '←' },
          { value: 'center', label: '↔' },
          { value: 'right', label: '→' },
          { value: 'justify', label: '☰' },
        ]}
      />
    </div>
  );
}

export function AdvancedTypoControls() {
  const { style, patch } = useQoefiStyle();
  const f = style.font ?? {};
  return (
    <div className="space-y-2">
      <InputRange
        label="Interligne"
        value={f.lineHeight ?? 1.5}
        min={1}
        max={3}
        step={0.05}
        onChange={(v) => patch({ font: { ...f, lineHeight: Math.round(v * 100) / 100 } })}
      />
      <InputRange
        label="Chasse"
        value={f.letterSpacing ?? 0}
        min={-2}
        max={8}
        step={0.1}
        onChange={(v) => patch({ font: { ...f, letterSpacing: Math.round(v * 10) / 10 } })}
      />
      <InputRadio
        value={f.transform ?? 'none'}
        onChange={(v) => patch({ font: { ...f, transform: v } })}
        options={[
          { value: 'none', label: 'Aa' },
          { value: 'uppercase', label: 'AA' },
          { value: 'capitalize', label: 'Aa' },
          { value: 'lowercase', label: 'aa' },
        ]}
      />
      <InputRadio
        value={f.decoration ?? 'none'}
        onChange={(v) => patch({ font: { ...f, decoration: v } })}
        options={[
          { value: 'none', label: 'Sans' },
          { value: 'underline', label: 'Souligné' },
          { value: 'line-through', label: 'Barré' },
        ]}
      />
    </div>
  );
}
