// =====================================================================
// 🧪 Paywall — sliceContentAtPaywall (zero-leak)
// =====================================================================
// 📖 Règle absolue : le contenu premium ne doit JAMAIS fuiter sur le wire
//    pour un utilisateur non autorisé, quel que soit le format de marker.
//    Ce test verrouille la régression : le marker Tiptap de qoe.fi
//    (`data-type="paywall-divider"`) doit être reconnu et tronqué.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { sliceContentAtPaywall } from '../paywall';

const TIPTAP_PAYWALL =
  '<p>Free teaser</p><div data-type="paywall-divider"></div><p>Secret premium body</p>';

describe('sliceContentAtPaywall', () => {
  it('tronque au marker Tiptap data-type="paywall-divider"', () => {
    const res = sliceContentAtPaywall(
      TIPTAP_PAYWALL,
      { isMember: false, isPaidSubscriber: false },
      'PAID_SUBSCRIBERS'
    );

    expect(res.isTruncated).toBe(true);
    expect(res.accessGranted).toBe(false);
    expect(res.content).not.toContain('Secret premium body');
    expect(res.content).toContain('Free teaser');
  });

  it('tronque au marker data-node-type="paywall-divider" (hérité)', () => {
    const content = '<p>Teaser</p><div data-node-type="paywall-divider"></div><p>Secret</p>';
    const res = sliceContentAtPaywall(
      content,
      { isMember: false, isPaidSubscriber: false },
      'PAID_SUBSCRIBERS'
    );

    expect(res.isTruncated).toBe(true);
    expect(res.content).not.toContain('Secret');
  });

  it("retourne le contenu complet si l'utilisateur est abonné payant", () => {
    const res = sliceContentAtPaywall(
      TIPTAP_PAYWALL,
      { isMember: true, isPaidSubscriber: true },
      'PAID_SUBSCRIBERS'
    );

    expect(res.isTruncated).toBe(false);
    expect(res.content).toContain('Secret premium body');
  });

  it('gère un contenu public sans marker (pas de troncage)', () => {
    const res = sliceContentAtPaywall(
      '<p>Just public</p>',
      { isMember: false, isPaidSubscriber: false },
      'PUBLIC'
    );

    expect(res.isTruncated).toBe(false);
    expect(res.content).toBe('<p>Just public</p>');
  });
});
