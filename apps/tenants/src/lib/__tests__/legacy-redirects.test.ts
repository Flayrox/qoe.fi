import { describe, expect, it } from 'vitest';
import { RESERVED_TENANT_ROUTES } from '@qoe/config';
import { LEGACY_TENANT_REDIRECTS, legacyRedirectRootSegment } from '../legacy-redirects';

describe('legacy redirects (anciennes URLs françaises)', () => {
  it('déclare des chemins absolus sans doublon', () => {
    const sources = LEGACY_TENANT_REDIRECTS.map((redirect) => redirect.source);

    expect(new Set(sources).size).toBe(sources.length);
    for (const redirect of LEGACY_TENANT_REDIRECTS) {
      expect(redirect.source.startsWith('/')).toBe(true);
      expect(redirect.destination.startsWith('/')).toBe(true);
      // Les paramètres dynamiques doivent se correspondre de part et d'autre.
      const params = redirect.source.match(/:\w+/g) ?? [];
      for (const param of params) {
        expect(redirect.destination).toContain(param);
      }
    }
  });

  it('réserve le segment de premier niveau de chaque alias', () => {
    for (const redirect of LEGACY_TENANT_REDIRECTS) {
      expect(RESERVED_TENANT_ROUTES).toContain(legacyRedirectRootSegment(redirect));
    }
  });
});
