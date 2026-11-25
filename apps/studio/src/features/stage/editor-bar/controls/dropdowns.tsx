// =====================================================================
// 🎛️ Contrôles CSS souverains (portés d'Onlook dropdowns/*)
// Border, Radius 4 coins, Padding/Margin 4 côtés, Display flex,
// Width/Height Hug-Fill-Fixed, Opacity, Background.
// =====================================================================

'use client';

import React from 'react';
import { InputRadio, InputRange, SpacingInputs, ColorField } from './inputs';
import { useQoefiStyle } from '../useQoefiStyle';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { CheckboxInput } from '@qoe/ui/checkbox';

export function BorderControl() {
  const { style, patch } = useQoefiStyle();
  const bw = typeof style.borderWidth === 'number' ? style.borderWidth : 0;
  return (
    <div className="space-y-2">
      <InputRange
        label={t`Bordure`}
        value={bw}
        min={0}
        max={16}
        step={1}
        onChange={(v) => patch({ borderWidth: v })}
      />
      <ColorField
        label={t`Couleur bordure`}
        value={style.borderColor ?? ''}
        onChange={(v) => patch({ borderColor: v })}
      />
    </div>
  );
}

export function RadiusControl() {
  const { style, patch } = useQoefiStyle();
  const r = style.radius;
  const vals =
    typeof r === 'number'
      ? { top: r, right: r, bottom: r, left: r }
      : {
          top: r?.topLeft ?? 0,
          right: r?.topRight ?? 0,
          bottom: r?.bottomRight ?? 0,
          left: r?.bottomLeft ?? 0,
        };
  return (
    <div className="space-y-2">
      <InputRange
        label={t`Rayon`}
        value={typeof r === 'number' ? r : Math.max(vals.top, vals.right, vals.bottom, vals.left)}
        min={0}
        max={64}
        step={2}
        onChange={(v) => patch({ radius: v })}
      />
      <SpacingInputs
        title={t`Coins indépendants`}
        values={vals}
        corners
        onSide={(side, v) => {
          const cur =
            typeof style.radius === 'object' && style.radius
              ? { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0, ...style.radius }
              : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
          if (side === 'all') patch({ radius: v });
          else {
            const map = {
              top: 'topLeft',
              right: 'topRight',
              bottom: 'bottomRight',
              left: 'bottomLeft',
            } as const;
            patch({ radius: { ...cur, [map[side]]: v } });
          }
        }}
      />
    </div>
  );
}

export function PaddingControl() {
  const { style, patchBox } = useQoefiStyle();
  const p = style.padding ?? {};
  return (
    <SpacingInputs
      title={t`Marge intérieure (padding)`}
      values={{ top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 }}
      onSide={(s, v) => patchBox('padding', s, v)}
    />
  );
}

export function MarginControl() {
  const { style, patch, patchBox } = useQoefiStyle();
  const m = style.margin ?? {};
  return (
    <div className="space-y-2">
      <SpacingInputs
        title={t`Marge extérieure (margin)`}
        values={{ top: m.top ?? 0, right: m.right ?? 0, bottom: m.bottom ?? 0, left: m.left ?? 0 }}
        onSide={(s, v) => patchBox('margin', s, v)}
      />
      <label className="flex cursor-pointer items-center justify-between text-[11px] text-muted-foreground">
        <span>{t`Centrer auto (margin auto)`}</span>
        <CheckboxInput
          checked={!!m.auto}
          onChange={(e) => patch({ margin: { ...m, auto: e.target.checked } })}
          className="accent-primary h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
        />
      </label>
    </div>
  );
}

export function DisplayControl() {
  const { style, patch } = useQoefiStyle();
  return (
    <div className="space-y-2">
      <InputRadio
        value={style.display ?? 'block'}
        onChange={(v) => patch({ display: v })}
        options={[
          { value: 'block', label: t`Bloc` },
          { value: 'flex', label: t`Flex` },
          { value: 'grid', label: t`Grille` },
        ]}
      />
      {style.display === 'flex' && (
        <>
          <InputRadio
            value={style.flexDirection ?? 'column'}
            onChange={(v) => patch({ flexDirection: v })}
            options={[
              { value: 'column', label: '↓ Colonne' },
              { value: 'row', label: '→ Ligne' },
            ]}
          />
          <InputRadio
            value={style.justifyContent ?? 'flex-start'}
            onChange={(v) => patch({ justifyContent: v })}
            options={[
              { value: 'flex-start', label: '←' },
              { value: 'center', label: '↔' },
              { value: 'flex-end', label: '→' },
              { value: 'space-between', label: '⇄' },
            ]}
          />
          <InputRadio
            value={style.alignItems ?? 'stretch'}
            onChange={(v) => patch({ alignItems: v })}
            options={[
              { value: 'flex-start', label: '↑' },
              { value: 'center', label: '↕' },
              { value: 'flex-end', label: '↓' },
              { value: 'stretch', label: '⤢' },
            ]}
          />
          <InputRange
            label={t`Écart`}
            value={style.gap ?? 0}
            min={0}
            max={96}
            step={4}
            onChange={(v) => patch({ gap: v })}
          />
        </>
      )}
    </div>
  );
}

export function DimensionControl() {
  const { style, patch } = useQoefiStyle();
  return (
    <div className="space-y-2">
      <InputRadio
        value={style.width?.mode ?? 'fill'}
        onChange={(v) => patch({ width: { ...(style.width ?? {}), mode: v } })}
        options={[
          { value: 'hug', label: t`Hug` },
          { value: 'fill', label: t`Fill` },
          { value: 'fixed', label: t`Fixe` },
        ]}
      />
      {(style.width?.mode ?? 'fill') === 'fixed' && (
        <InputRange
          label={t`Largeur`}
          value={style.width?.value ?? 800}
          min={200}
          max={1600}
          step={8}
          onChange={(v) => patch({ width: { ...(style.width ?? {}), mode: 'fixed', value: v } })}
        />
      )}
      <InputRadio
        value={style.height?.mode ?? 'hug'}
        onChange={(v) => patch({ height: { ...(style.height ?? {}), mode: v } })}
        options={[
          { value: 'hug', label: t`Hug` },
          { value: 'fill', label: t`Fill` },
          { value: 'fixed', label: t`Fixe` },
        ]}
      />
      {(style.height?.mode ?? 'hug') === 'fixed' && (
        <InputRange
          label={t`Hauteur`}
          value={style.height?.value ?? 400}
          min={80}
          max={1200}
          step={8}
          onChange={(v) => patch({ height: { ...(style.height ?? {}), mode: 'fixed', value: v } })}
        />
      )}
    </div>
  );
}

export function OpacityControl() {
  const { style, patch } = useQoefiStyle();
  return (
    <div className="space-y-2">
      <InputRange
        label={t`Opacité`}
        value={style.opacity ?? 100}
        min={0}
        max={100}
        step={1}
        onChange={(v) => patch({ opacity: v })}
      />
      <div className="flex gap-1">
        {[100, 80, 50, 25, 0].map((p) => (
          <Button
            variant="ghost"
            size="xs"
            key={p}
            type="button"
            onClick={() => patch({ opacity: p })}
            className="hover:bg-transparent flex-1 rounded-md bg-muted/50 py-1 font-mono text-[10px]! text-muted-foreground hover:text-foreground h-auto! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block px-0 "
          >
            {p}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function BackgroundControl() {
  const { style, patch } = useQoefiStyle();
  return (
    <div className="space-y-2">
      <ColorField
        label={t`Fond`}
        value={style.background?.color ?? ''}
        onChange={(v) => patch({ background: { ...(style.background ?? {}), color: v } })}
      />
      <InputRange
        label={t`Alpha`}
        value={style.background?.alpha ?? 100}
        min={0}
        max={100}
        step={1}
        onChange={(v) => patch({ background: { ...(style.background ?? {}), alpha: v } })}
      />
    </div>
  );
}
