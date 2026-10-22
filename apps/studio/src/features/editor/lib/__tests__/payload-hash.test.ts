import { describe, expect, it } from 'vitest';
import { computePayloadHash } from '../payload-hash';

const base = {
  title: 'Mon article',
  content: '<p>Bonjour</p>',
  slug: 'mon-article',
  published: false,
  status: 'DRAFT',
  categoryId: null,
  seoTitle: '',
  seoDescription: '',
  attributions: [],
};

describe('computePayloadHash', () => {
  it('produit la même empreinte pour deux tableaux équivalents', () => {
    expect(computePayloadHash({ ...base, attributions: [] })).toBe(
      computePayloadHash({ ...base, attributions: [] })
    );
  });

  it('ignore l’identité du tableau d’attributions mais pas son contenu', () => {
    const a = computePayloadHash({
      ...base,
      attributions: [{ userId: 'u1', role: 'CO_AUTHOR', order: 1, isVisible: true }],
    });
    const b = computePayloadHash({
      ...base,
      attributions: [{ userId: 'u1', role: 'CO_AUTHOR', order: 1, isVisible: true }],
    });
    const c = computePayloadHash({
      ...base,
      attributions: [{ userId: 'u1', role: 'CO_AUTHOR', order: 2, isVisible: true }],
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('change quand le contenu, le statut ou la programmation change', () => {
    const initial = computePayloadHash(base);
    expect(computePayloadHash({ ...base, content: '<p>Autre</p>' })).not.toBe(initial);
    expect(computePayloadHash({ ...base, status: 'PUBLISHED' })).not.toBe(initial);
    expect(computePayloadHash({ ...base, scheduledAt: '2026-10-22T18:30:00.000Z' })).not.toBe(
      initial
    );
  });
});
