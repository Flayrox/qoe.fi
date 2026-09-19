import { describe, expect, it } from 'vitest';
import { isStaleServerActionError } from './action';

describe('isStaleServerActionError', () => {
  it('reconnaît la signature exacte Next après un déploiement', () => {
    expect(isStaleServerActionError(new Error('Failed to find Server Action "abc123"'))).toBe(true);
  });

  it('suit la chaîne cause quand Next enveloppe l’erreur', () => {
    expect(
      isStaleServerActionError(
        new Error('échec de l’action', {
          cause: 'Failed to find Server Action "0" (older or newer deployment)',
        })
      )
    ).toBe(true);
  });

  it('ignore les autres erreurs applicatives', () => {
    expect(isStaleServerActionError(new Error('Publication ou article introuvable.'))).toBe(false);
    expect(isStaleServerActionError(null)).toBe(false);
  });
});
