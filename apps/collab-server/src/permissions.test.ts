import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import * as permissionsModule from './permissions';
import { createPublisherAccessChecker, parseArticleId } from './permissions';

function mockPool(row: unknown): Pool {
  return {
    query: vi.fn(async () => ({ rows: row ? [row] : [] })),
  } as unknown as Pool;
}

describe('parseArticleId', () => {
  it('extrait l’id d’un document article:{id}', () => {
    expect(parseArticleId('article:abc123')).toBe('abc123');
    expect(parseArticleId('article:art_uuid-01')).toBe('art_uuid-01');
  });

  it('refuse les formats invalides, traversées et caractères de contrôle', () => {
    expect(parseArticleId('article:')).toBeNull();
    expect(parseArticleId('autre:abc')).toBeNull();
    expect(parseArticleId('abc')).toBeNull();
    expect(parseArticleId('article:../secret')).toBeNull();
    expect(parseArticleId('article:a b')).toBeNull();
    expect(parseArticleId('article:abc\n123')).toBeNull();
    expect(parseArticleId(`article:${'a'.repeat(129)}`)).toBeNull();
  });
});

describe('canEditMediaArticle (parité Go)', () => {
  const fn = (
    permissionsModule as unknown as {
      canEditMediaArticle?: (
        member:
          | { role: string; permissions?: string[] | null; status?: string | null }
          | null
          | undefined,
        articleAuthorId: string,
        memberUserId: string
      ) => boolean;
    }
  ).canEditMediaArticle;

  it('refuse un viewer actif sur un média', () => {
    expect(fn).toBeTypeOf('function');
    expect(fn!({ role: 'viewer', status: 'active' }, 'author-1', 'user-1')).toBe(false);
  });

  it('refuse un writer sur l’article d’un autre auteur, mais autorise son propre article', () => {
    expect(fn!({ role: 'writer', status: 'active' }, 'author-other', 'writer-1')).toBe(false);
    expect(fn!({ role: 'writer', status: 'active' }, 'writer-1', 'writer-1')).toBe(true);
  });

  it('autorise editor et owner sur l’article d’un autre auteur', () => {
    expect(fn!({ role: 'editor', status: 'active' }, 'author-other', 'editor-1')).toBe(true);
    expect(fn!({ role: 'owner', status: 'active' }, 'author-other', 'owner-1')).toBe(true);
  });

  it('applique les overrides explicites dans l’ordre (ajout et retrait)', () => {
    expect(
      fn!(
        { role: 'editor', permissions: ['-media:edit:any'], status: 'active' },
        'author-other',
        'editor-1'
      )
    ).toBe(false);
    expect(
      fn!(
        { role: 'writer', permissions: ['media:edit:any'], status: 'active' },
        'author-other',
        'writer-1'
      )
    ).toBe(true);
    expect(
      fn!(
        { role: 'writer', permissions: ['-media:edit:any', 'media:edit:any'], status: 'active' },
        'author-other',
        'writer-1'
      )
    ).toBe(true);
  });

  it('refuse un membre non actif (invited / suspended)', () => {
    expect(fn!({ role: 'owner', status: 'invited' }, 'owner-1', 'owner-1')).toBe(false);
    expect(fn!({ role: 'editor', status: 'suspended' }, 'author-other', 'editor-1')).toBe(false);
  });
});

describe('createPublisherAccessChecker', () => {
  it('refuse un document au nom invalide sans interroger la base', async () => {
    const pool = mockPool({ publisherType: 'PERSONAL', authorId: 'user-1' });
    const check = createPublisherAccessChecker(pool);
    await expect(check('user-1', 'pas-un-article')).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('PERSONAL : autorise l’auteur et refuse un tiers sans attribution', async () => {
    const poolAuthor = mockPool({
      publisherType: 'PERSONAL',
      authorId: 'user-1',
      memberRole: null,
      memberPermissions: null,
      memberStatus: null,
      hasAttribution: false,
      hasAcceptedCollab: false,
    });
    expect(await createPublisherAccessChecker(poolAuthor)('user-1', 'article:art-1')).toBe(true);

    const poolOther = mockPool({
      publisherType: 'PERSONAL',
      authorId: 'author-1',
      memberRole: null,
      memberPermissions: null,
      memberStatus: null,
      hasAttribution: false,
      hasAcceptedCollab: false,
    });
    expect(await createPublisherAccessChecker(poolOther)('intruder', 'article:art-1')).toBe(false);
  });

  it('MEDIA : respecte les rôles, exclusions et co-auteurs externes', async () => {
    // Membre viewer → refusé
    expect(
      await createPublisherAccessChecker(
        mockPool({
          publisherType: 'MEDIA',
          authorId: 'author-1',
          memberRole: 'viewer',
          memberPermissions: [],
          memberStatus: 'active',
          hasAttribution: false,
          hasAcceptedCollab: false,
        })
      )('viewer-1', 'article:art-1')
    ).toBe(false);

    // Membre writer sur article d’autrui → refusé
    expect(
      await createPublisherAccessChecker(
        mockPool({
          publisherType: 'MEDIA',
          authorId: 'author-1',
          memberRole: 'writer',
          memberPermissions: [],
          memberStatus: 'active',
          hasAttribution: false,
          hasAcceptedCollab: false,
        })
      )('writer-2', 'article:art-1')
    ).toBe(false);

    // Membre editor sur article d’autrui → autorisé
    expect(
      await createPublisherAccessChecker(
        mockPool({
          publisherType: 'MEDIA',
          authorId: 'author-1',
          memberRole: 'editor',
          memberPermissions: [],
          memberStatus: 'active',
          hasAttribution: false,
          hasAcceptedCollab: false,
        })
      )('editor-1', 'article:art-1')
    ).toBe(true);

    // Auteur exclu d’un média → refusé
    expect(
      await createPublisherAccessChecker(
        mockPool({
          publisherType: 'MEDIA',
          authorId: 'author-exclu',
          memberRole: null,
          memberPermissions: null,
          memberStatus: null,
          hasAttribution: false,
          hasAcceptedCollab: false,
        })
      )('author-exclu', 'article:art-1')
    ).toBe(false);

    // Co-auteur externe invité → autorisé
    expect(
      await createPublisherAccessChecker(
        mockPool({
          publisherType: 'MEDIA',
          authorId: 'author-1',
          memberRole: null,
          memberPermissions: null,
          memberStatus: null,
          hasAttribution: true,
          hasAcceptedCollab: false,
        })
      )('coauthor-1', 'article:art-1')
    ).toBe(true);
  });

  it('vérifie la requête SQL : protège les médias, vérifie mm.status = active et exige CollaborationRequest ACCEPTED', async () => {
    const pool = mockPool({
      publisherType: 'MEDIA',
      authorId: 'user-1',
      memberRole: 'owner',
      memberPermissions: [],
      memberStatus: 'active',
      hasAttribution: false,
      hasAcceptedCollab: false,
    });
    const check = createPublisherAccessChecker(pool);
    await check('user-1', 'article:art-1');
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('mm."status" = \'active\'');
    expect(sql).toContain("aa.role <> 'PRIMARY_AUTHOR'");
    expect(sql).toContain("cr.status = 'ACCEPTED'");
    expect(sql).not.toContain("cr.\"status\" IN ('PENDING', 'ACCEPTED')");
    expect(sql).not.toContain("cr.status IN ('PENDING', 'ACCEPTED')");
  });
});
