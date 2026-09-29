import { describe, it, expect } from 'vitest';
import { filterFaq, mergeFaq, defaultFaq } from './help-faq';

// Centre d'aide : recherche bilingue + fusion gérés/statique (override par
// slug, repli statique si API injoignable).

describe('filterFaq', () => {
  const all = defaultFaq();

  it('vide = toutes les entrées', () => {
    expect(filterFaq(all, '').length).toBeGreaterThan(5);
  });

  it('trouve en français', () => {
    const res = filterFaq(all, 'désabonner');
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].id).toBe('desabonnement');
  });

  it('trouve en anglais sur le même corpus', () => {
    const res = filterFaq(all, 'unsubscribe');
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].id).toBe('desabonnement');
  });

  it('insensible à la casse et aux espaces', () => {
    expect(filterFaq(all, '  COMPTE PERDU ').length).toBeGreaterThanOrEqual(1);
  });

  it('sans match = vide (le formulaire prend le relais)', () => {
    expect(filterFaq(all, 'xyzzy-inexistant')).toEqual([]);
  });
});

describe('mergeFaq', () => {
  it('gérés d\u2019abord, statiques ensuite', () => {
    const merged = mergeFaq([
      { slug: 'nouveau', titleFr: 'Nouveau', titleEn: 'New', bodyFr: 'Corps', bodyEn: 'Body' },
    ]);
    expect(merged[0].id).toBe('nouveau');
    expect(merged.length).toBe(defaultFaq().length + 1);
  });

  it('même slug = la version console remplace (pas de doublon)', () => {
    const merged = mergeFaq([
      {
        slug: 'compte-perdu',
        titleFr: 'Réécrit',
        titleEn: 'Rewritten',
        bodyFr: 'Nouveau',
        bodyEn: 'New',
      },
    ]);
    const matches = merged.filter((e) => e.id === 'compte-perdu');
    expect(matches).toHaveLength(1);
    expect(matches[0].qFr).toBe('Réécrit');
    expect(merged.length).toBe(defaultFaq().length);
  });

  it('vide = statique seul (repli API injoignable)', () => {
    expect(mergeFaq([])).toEqual(defaultFaq());
  });
});
