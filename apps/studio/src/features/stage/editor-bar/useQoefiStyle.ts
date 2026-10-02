// =====================================================================
// 🧰 useQoefiStyle — hooks style souverains (portés d'Onlook use-box/
// use-text/use-dimension/use-color-update, sans AST Tailwind)
// Lit/écrit BlockStyleProps via onUpdateBlockProps.
// =====================================================================

'use client';

import { useCallback, useMemo } from 'react';
import type { BlockStyleProps, TemplateBlock } from '@qoe/ui/templates';
import { useStageEngine } from '../context/StageEngineContext';

function getStyle(block: TemplateBlock | null): BlockStyleProps {
  const props = (block?.props ?? {}) as Record<string, unknown>;
  const s = props.style;
  return s && typeof s === 'object' ? (s as BlockStyleProps) : {};
}

export function useQoefiStyle() {
  const engine = useStageEngine();
  const block = engine.selectedBlock;
  const style = useMemo(() => getStyle(block), [block]);

  const patch = useCallback(
    (next: BlockStyleProps) => {
      if (!block) return;
      engine.updateBlockProps(block.id, { style: { ...style, ...next } });
    },
    [block, engine, style]
  );

  const patchBox = useCallback(
    (
      key: 'padding' | 'margin',
      side: 'top' | 'right' | 'bottom' | 'left' | 'all',
      value: number
    ) => {
      const cur = { ...(style[key] ?? {}) } as Record<string, number>;
      if (side === 'all') {
        patch({
          [key]: { ...cur, top: value, right: value, bottom: value, left: value },
        } as BlockStyleProps);
      } else {
        patch({ [key]: { ...cur, [side]: value } } as BlockStyleProps);
      }
    },
    [patch, style]
  );

  return { block, style, patch, patchBox };
}
