// =====================================================================
// 🧪 describeAuthzMode — une sonde muette n'est pas « en observation »
// =====================================================================
// Rouge mesuré avant correctif : l'écran répondait « observation » et
// « les refus sont journalisés, pas encore appliqués » sur `health = null`,
// c'est-à-dire en affirmant un état d'armement jamais lu.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { describeAuthzMode } from '../authz-mode-copy';

describe('describeAuthzMode', () => {
  it('avoue l’ignorance quand la sonde est muette', () => {
    const copy = describeAuthzMode(null);

    expect(copy.label).not.toBe('observation');
    expect(copy.detail).not.toContain('pas encore appliqués');
    expect(copy.label).toBe('illisible');
  });

  it('distingue observation et refus armé quand la sonde répond', () => {
    expect(describeAuthzMode({ mode: 'observe' } as never).label).toBe('observation');
    expect(describeAuthzMode({ mode: 'enforce' } as never).label).toBe('refus');
  });
});
