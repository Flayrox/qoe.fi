import { describe, expect, it } from 'vitest';

import type { FeedSlice } from '@qoe/sdk/mobile';

import { feedSliceId, mergeAdoptedSlices, pickNewSlices } from './feed-pill';

function slice(id: string, targetId?: string): FeedSlice {
  return {
    id,
    targetPost: targetId ? { id: targetId } : undefined,
  } as unknown as FeedSlice;
}

describe('feed-pill — noyau pur', () => {
  it('feedSliceId privilégie l’id du post cible, sinon celui de la tranche', () => {
    expect(feedSliceId(slice('slice_1', 'post_1'))).toBe('post_1');
    expect(feedSliceId(slice('slice_2'))).toBe('slice_2');
  });

  it('pickNewSlices ignore les pensées déjà visibles ou déjà connues', () => {
    const incoming = [slice('s1', 'p1'), slice('s2', 'p2'), slice('s3', 'p3')];
    // p1 est déjà affichée, p2 déjà dans le buffer.
    const fresh = pickNewSlices(incoming, ['p1', 'p2']);
    expect(fresh.map(feedSliceId)).toEqual(['p3']);
  });

  it('pickNewSlices déduplique aussi les doublons internes au lot reçu', () => {
    const incoming = [slice('s1', 'p1'), slice('s9', 'p1')];
    expect(pickNewSlices(incoming, []).map(feedSliceId)).toEqual(['p1']);
  });

  it('mergeAdoptedSlices place les nouvelles en tête, déduplique et plafonne', () => {
    // `incoming` = les tranches fraîchement adoptées (plus récentes) : elles
    // passent devant celles déjà adoptées, et un doublon n'apparaît qu'une fois.
    const merged = mergeAdoptedSlices([slice('s1', 'p1')], [slice('s2', 'p2'), slice('s1b', 'p1')]);
    expect(merged.map(feedSliceId)).toEqual(['p2', 'p1']);

    const many = Array.from({ length: 60 }, (_, i) => slice(`s${i}`, `p${i}`));
    const capped = mergeAdoptedSlices(many, [slice('last', 'p_last')]);
    expect(capped.length).toBeLessThanOrEqual(40);
    // Le plafond garde les entrées les plus récentes.
    expect(feedSliceId(capped[0]!)).toBe('p_last');
  });
});
