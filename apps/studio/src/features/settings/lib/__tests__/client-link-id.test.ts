// =====================================================================
// 🧪 clientNavigationLinkId — deux liens ajoutés au même tick
// =====================================================================
// Le défaut mesuré : `link_${Date.now()}` donnait la même clé à deux liens
// créés dans la même milliseconde, donc la même entrée `navOrder`. Ce test
// fige l'invariant : des identifiants générés sans laisser passer le temps
// sont tous distincts.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { CLIENT_LINK_ID_PREFIX, clientNavigationLinkId } from '../client-link-id';

describe('clientNavigationLinkId', () => {
  it('garde le préfixe attendu par navOrder', () => {
    expect(clientNavigationLinkId().startsWith(CLIENT_LINK_ID_PREFIX)).toBe(true);
  });

  it('ne collisionne pas deux identifiants générés dans le même tick', () => {
    const ids = Array.from({ length: 200 }, () => clientNavigationLinkId());

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produit des clés utilisables dans `link:<id>`', () => {
    const id = clientNavigationLinkId();

    expect(id).toMatch(/^link_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/);
  });
});
