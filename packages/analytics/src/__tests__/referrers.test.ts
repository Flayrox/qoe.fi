import { describe, expect, it } from 'vitest';
import { getReferrerLabel } from '../referrers';

describe('getReferrerLabel', () => {
  it('catégorise l’accès direct', () => {
    expect(getReferrerLabel('')).toEqual({
      name: 'Accès direct / Marque-page',
      category: 'Direct',
    });
    expect(getReferrerLabel('direct')).toEqual({
      name: 'Accès direct / Marque-page',
      category: 'Direct',
    });
    expect(getReferrerLabel('(none)')).toEqual({
      name: 'Accès direct / Marque-page',
      category: 'Direct',
    });
  });

  it('reconnaît les moteurs de recherche', () => {
    expect(getReferrerLabel('https://www.google.com')).toMatchObject({
      category: 'Recherche',
      name: 'Google Search',
    });
    expect(getReferrerLabel('https://www.google.fr/search?q=foo')).toMatchObject({
      category: 'Recherche',
      name: 'Google Search',
    });
    expect(getReferrerLabel('https://duckduckgo.com')).toMatchObject({
      category: 'Recherche',
      name: 'DuckDuckGo',
    });
    expect(getReferrerLabel('https://www.qwant.com')).toMatchObject({
      category: 'Recherche',
      name: 'Qwant',
    });
    expect(getReferrerLabel('https://www.bing.com')).toMatchObject({
      category: 'Recherche',
      name: 'Bing',
    });
  });

  it('reconnaît les réseaux sociaux', () => {
    expect(getReferrerLabel('https://x.com/user')).toMatchObject({
      category: 'Réseaux Sociaux',
      name: 'X / Twitter',
    });
    expect(getReferrerLabel('https://t.co/abc')).toMatchObject({
      category: 'Réseaux Sociaux',
      name: 'X / Twitter',
    });
    expect(getReferrerLabel('https://www.linkedin.com')).toMatchObject({
      category: 'Réseaux Sociaux',
      name: 'LinkedIn',
    });
    expect(getReferrerLabel('https://www.facebook.com')).toMatchObject({
      category: 'Réseaux Sociaux',
      name: 'Facebook',
    });
    expect(getReferrerLabel('https://www.threads.net')).toMatchObject({
      category: 'Réseaux Sociaux',
      name: 'Threads',
    });
  });

  it('reconnaît les newsletters', () => {
    expect(getReferrerLabel('https://substack.com')).toMatchObject({
      category: 'Newsletter',
      name: 'Substack Network',
    });
    expect(getReferrerLabel('https://app.beehiiv.com')).toMatchObject({
      category: 'Newsletter',
      name: 'beehiiv',
    });
  });

  it('retombe sur un referrer web brut', () => {
    const label = getReferrerLabel('https://monblog.fr/page');
    expect(label).toEqual({ name: 'monblog.fr/page', category: 'Web Referrer' });
  });
});
