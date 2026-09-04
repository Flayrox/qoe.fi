import { describe, it, expect } from 'vitest';
import { parseSpotlightParams } from './spotlight';

describe('parseSpotlightParams — deep-link citation → article (tranche 6-b)', () => {
  it('parse des params valides (start/end entiers, sha hex)', () => {
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '42', hlSha: 'abc123def456' })).toEqual({
      start: 0,
      end: 42,
      sha: 'abc123def456',
    });
    expect(parseSpotlightParams({ hlStart: '100', hlEnd: '200', hlSha: 'A'.repeat(64) })).toEqual({
      start: 100,
      end: 200,
      sha: 'A'.repeat(64),
    });
  });

  it('rejette les valeurs manquantes ou de mauvais type', () => {
    expect(parseSpotlightParams({})).toBeNull();
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '42' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: ['0'], hlEnd: '42', hlSha: 'abcd' })).toBeNull();
  });

  it('rejette les entiers non numériques, négatifs ou inversés', () => {
    expect(parseSpotlightParams({ hlStart: 'abc', hlEnd: '42', hlSha: 'abcd' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: '-1', hlEnd: '42', hlSha: 'abcd' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: '42', hlEnd: '42', hlSha: 'abcd' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: '42', hlEnd: '0', hlSha: 'abcd' })).toBeNull();
  });

  it('rejette les sha invalides (trop courts, non hex, trop longs)', () => {
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '1', hlSha: 'abc' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '1', hlSha: 'zzzzzzzz' })).toBeNull();
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '1', hlSha: 'a'.repeat(129) })).toBeNull();
  });

  it('rejette les passages démesurés (borne anti-abus)', () => {
    expect(parseSpotlightParams({ hlStart: '0', hlEnd: '50001', hlSha: 'abcd1234' })).toBeNull();
  });

  it('rejette les entiers non sûrs (overflow)', () => {
    expect(
      parseSpotlightParams({
        hlStart: '9007199254740993',
        hlEnd: '9007199254740995',
        hlSha: 'abcd1234',
      })
    ).toBeNull();
  });
});
