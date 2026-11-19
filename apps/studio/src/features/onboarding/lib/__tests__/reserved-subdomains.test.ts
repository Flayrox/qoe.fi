import { describe, expect, it } from 'vitest';

import { isReservedSubdomain } from '../reserved-subdomains';

// F160 — le wizard d'onboarding tenait sa propre liste de sous-domaines
// réservés (26 entrées), qui ne couvrait pas les hôtes du produit : il pouvait
// proposer `collab`, `core` ou `tenants` comme adresse disponible, et le
// serveur (qui ne réserve pas ces noms) créait la publication dessus.
describe('onboarding — sous-domaines réservés', () => {
  it('refuse les hôtes du produit absents de la liste locale', () => {
    for (const host of ['collab', 'core', 'tenants', 'hi', 'assets', 'landing']) {
      expect(isReservedSubdomain(host), host).toBe(true);
    }
  });

  it('refuse tout ce que le serveur refuse', () => {
    for (const host of ['search', 'files', 'uploads', 'web', 'system', 'staging']) {
      expect(isReservedSubdomain(host), host).toBe(true);
    }
  });

  it('laisse passer un vrai nom de publication', () => {
    expect(isReservedSubdomain('le-journal-de-claire')).toBe(false);
  });
});
