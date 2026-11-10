import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { createPublisherAccessChecker, parseArticleId } from './permissions';

function mockPool(result: unknown): Pool {
  return {
    query: vi.fn(async () => ({ rows: [result] })),
  } as unknown as Pool;
}

describe('parseArticleId', () => {
  it('extrait l’id d’un document article:{id}', () => {
    expect(parseArticleId('article:abc123')).toBe('abc123');
  });

  it('refuse les formats invalides', () => {
    expect(parseArticleId('article:')).toBeNull();
    expect(parseArticleId('autre:abc')).toBeNull();
    expect(parseArticleId('abc')).toBeNull();
  });
});

describe('createPublisherAccessChecker', () => {
  it('autorise quand la requête répond allowed=true', async () => {
    const pool = mockPool({ allowed: true });
    const check = createPublisherAccessChecker(pool);
    await expect(check('user-1', 'article:art-1')).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM "Article"'), [
      'user-1',
      'art-1',
    ]);
  });

  it('refuse quand allowed=false', async () => {
    const check = createPublisherAccessChecker(mockPool({ allowed: false }));
    await expect(check('user-1', 'article:art-1')).resolves.toBe(false);
  });

  it('refuse un document au nom invalide sans interroger la base', async () => {
    const pool = mockPool({ allowed: true });
    const check = createPublisherAccessChecker(pool);
    await expect(check('user-1', 'pas-un-article')).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('vérifie la requête SQL : protège les médias contre un auteur exclu (PERSONAL requis pour authorId seul)', async () => {
    const pool = mockPool({ allowed: true });
    const check = createPublisherAccessChecker(pool);
    await check('user-1', 'article:art-1');
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('p.type = \'PERSONAL\' AND a."authorId" = $1');
    expect(sql).toContain("aa.role <> 'PRIMARY_AUTHOR'");
  });
});
