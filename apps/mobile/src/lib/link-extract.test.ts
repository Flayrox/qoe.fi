import { describe, expect, it } from 'vitest';

import { extractFirstUrl, hostOf } from './link-extract';

describe('extractFirstUrl — carte de lien d’une pensée', () => {
  it('extrait l’URL nue', () => {
    expect(extractFirstUrl('lire https://qoe.fi/article/x')).toBe('https://qoe.fi/article/x');
  });

  it('ne garde pas la ponctuation finale de la phrase', () => {
    // Un point, une virgule ou une parenthèse de prose collés à l'URL ne font
    // pas partie du lien : sinon la carte affiche un hôte « qoe.fi. » et le
    // navigateur ouvre une URL inexistante.
    expect(extractFirstUrl('super article : https://qoe.fi/a.')).toBe('https://qoe.fi/a');
    expect(extractFirstUrl('voir https://qoe.fi/a, puis')).toBe('https://qoe.fi/a');
    expect(extractFirstUrl('(source : https://qoe.fi/a)')).toBe('https://qoe.fi/a');
    expect(extractFirstUrl('donc https://qoe.fi/a !')).toBe('https://qoe.fi/a');
  });

  it('conserve une parenthèse appartenant à l’URL', () => {
    expect(extractFirstUrl('https://fr.wikipedia.org/wiki/X_(film)')).toBe(
      'https://fr.wikipedia.org/wiki/X_(film)'
    );
  });

  it('retourne null sans URL ou sans texte', () => {
    expect(extractFirstUrl('aucun lien ici')).toBeNull();
    expect(extractFirstUrl('')).toBeNull();
    expect(extractFirstUrl(null)).toBeNull();
    expect(extractFirstUrl(undefined)).toBeNull();
  });
});

describe('hostOf — hôte affiché', () => {
  it('retire www. et garde le domaine', () => {
    expect(hostOf('https://www.qoe.fi/a')).toBe('qoe.fi');
  });

  it('retourne l’entrée si l’URL est invalide', () => {
    expect(hostOf('pas une url')).toBe('pas une url');
  });
});
