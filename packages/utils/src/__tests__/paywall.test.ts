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

  it('tronque au marker HTML comment <!--paywall--> (format legacy Ghost/WordPress)', () => {
    const content =
      '<p>Teaser offert</p><p>Second teaser</p><!--paywall--><p>Secret premium body</p>';
    const res = sliceContentAtPaywall(
      content,
      { isMember: false, isPaidSubscriber: false },
      'PAID_SUBSCRIBERS'
    );

    expect(res.isTruncated).toBe(true);
    expect(res.accessGranted).toBe(false);
    expect(res.content).toContain('Teaser offert');
    expect(res.content).not.toContain('Secret premium body');
    expect(res.paywallMeta?.teaserParagraphsCount).toBe(2);
  });

  it('fallback zéro-leak : sans marker, tronque aux 2 premiers paragraphes', () => {
    const content =
      '<p>Premier paragraphe public</p><p>Deuxième paragraphe public</p><p>Troisième secret</p>';
    const res = sliceContentAtPaywall(
      content,
      { isMember: false, isPaidSubscriber: false },
      'PAID_SUBSCRIBERS'
    );

    expect(res.isTruncated).toBe(true);
    expect(res.accessGranted).toBe(false);
    expect(res.content).toContain('Premier paragraphe public');
    expect(res.content).toContain('Deuxième paragraphe public');
    expect(res.content).not.toContain('Troisième secret');
  });

  it('membre inscrit (email) accède au contenu MEMBERS_ONLY mais pas PAID_SUBSCRIBERS', () => {
    const content = '<p>Teaser</p><!--paywall--><p>Secret</p>';
    const entitlements = { isMember: true, isPaidSubscriber: false };

    const membersOnly = sliceContentAtPaywall(content, entitlements, 'MEMBERS_ONLY');
    expect(membersOnly.accessGranted).toBe(true);
    expect(membersOnly.content).toContain('Secret');

    const paidOnly = sliceContentAtPaywall(content, entitlements, 'PAID_SUBSCRIBERS');
    expect(paidOnly.accessGranted).toBe(false);
    expect(paidOnly.content).not.toContain('Secret');
  });
});
