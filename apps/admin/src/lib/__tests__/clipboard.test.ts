// =====================================================================
// 🧪 clipboard — le refus du navigateur est une valeur, pas un rejet
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retourne true quand la copie réussit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyToClipboard('rep_42')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('rep_42');
  });

  it('retourne false quand le navigateur refuse, sans rejet', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    await expect(copyToClipboard('rep_42')).resolves.toBe(false);
  });

  it('retourne false quand l’API n’existe pas', async () => {
    stubClipboard(undefined);

    await expect(copyToClipboard('rep_42')).resolves.toBe(false);
  });
});
