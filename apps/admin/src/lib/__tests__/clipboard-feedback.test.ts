// =====================================================================
// 🧪 Copie depuis un menu de ligne — l'opérateur sait ce qui s'est passé
// =====================================================================
// Le défaut mesuré (R155) : les onze écrans de F357 faisaient
// `void copyToClipboard(id)` — le booléen de retour était jeté, donc une copie
// refusée (permission, iframe, page non focus) ne produisait **rien** et la
// copie réussie non plus. Seul `WorkTable` avait un retour.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { copyToClipboard, copyWithToast } from '../clipboard';

function clipboardWith(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('copyWithToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // On retire le stub pour ne pas fuir entre les fichiers.
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('annonce la copie réussie avec son libellé', async () => {
    clipboardWith(async () => {});

    await expect(copyWithToast('usr_42', "L'identifiant")).resolves.toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith("L'identifiant copié");
    expect(toastError).not.toHaveBeenCalled();
  });

  it('annonce le refus du navigateur au lieu de le taire', async () => {
    clipboardWith(async () => {
      throw new Error('NotAllowedError');
    });

    await expect(copyWithToast('usr_42', "L'identifiant")).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      "Copie impossible — L'identifiant reste lisible dans la ligne"
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('laisse le helper pur muet (WorkTable et CopyableId ont leur propre retour)', async () => {
    clipboardWith(async () => {});

    await expect(copyToClipboard('usr_42')).resolves.toBe(true);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
