// =====================================================================
// 🧵 Fil paginé (L42) — curseur exposé, page suivante, fusion d'arbre
// =====================================================================
// 🐛 Régression couverte : `Thread()` renvoie désormais une première page +
//    `repliesCursor`/`repliesTruncated`. Si le mapping les perdait, le client
//    croirait le fil complet et n'afficherait jamais les réponses au-delà de
//    la page. La fusion doit rattacher chaque réponse à son parent réel (même
//    arrivée dans une page ultérieure), rester idempotente, et ne jamais faire
//    disparaître une réponse dont le parent n'est pas chargé.
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

// safeAction est neutralisé : on teste le mapping et le contrat, pas l'auth.
vi.mock('../actions/utils/safe-action', () => ({
  safeAction:
    (fn: (input: unknown, user: unknown) => Promise<unknown>) => async (input: unknown) => ({
      ok: true,
      data: await fn(input, { id: 'user_viewer' }),
    }),
}));

import { getPostThreadAction, getPostThreadRepliesAction } from '../actions/feed';
import {
  mapFeedPostToThreadThought,
  mapGoThreadToWebThread,
  mergeThreadReplies,
  type WebThreadPost,
} from '../actions/feed/mappers';

beforeEach(() => {
  goFetch.mockReset();
});

function rawPost(id: string, parentId: string | null) {
  return {
    id,
    parentId,
    rootId: 'root',
    content: `contenu ${id}`,
    createdAt: '2026-11-24T10:00:00.000Z',
    author: { id: `author-${id}`, username: `auteur-${id}` },
  };
}

function rawReply(id: string, parentId: string | null): WebThreadPost {
  const mapped = mapFeedPostToThreadThought(rawPost(id, parentId) as never);
  if (!mapped) throw new Error(`mapping impossible pour ${id}`);
  return mapped;
}

describe('getPostThreadAction — pagination annoncée', () => {
  it('expose repliesCursor et repliesTruncated pour que le client demande la suite', async () => {
    goFetch.mockResolvedValueOnce({
      post: {
        ...rawPost('root', null),
        replies: [rawPost('r1', 'root')],
        repliesCursor: 'cursor-page-2',
        repliesTruncated: true,
      },
    });

    const res = await getPostThreadAction('root');
    if (!res.ok) throw new Error('action en échec');

    expect(goFetch).toHaveBeenCalledWith('/v1/posts/root/thread');
    expect(res.data?.post.repliesCursor).toBe('cursor-page-2');
    expect(res.data?.post.repliesTruncated).toBe(true);
    expect(res.data?.post.replies.map((r) => r.id)).toEqual(['r1']);
  });

  it('un fil complet ne propose aucune page suivante', async () => {
    goFetch.mockResolvedValueOnce({
      post: { ...rawPost('root', null), replies: [], repliesCursor: '', repliesTruncated: false },
    });

    const res = await getPostThreadAction('root');
    if (!res.ok) throw new Error('action en échec');

    expect(res.data?.post.repliesCursor).toBe('');
    expect(res.data?.post.repliesTruncated).toBe(false);
  });
});

describe('getPostThreadRepliesAction — page suivante du fil', () => {
  it('interroge scope=thread avec le curseur opaque et renvoie la page mappée', async () => {
    goFetch.mockResolvedValueOnce({
      items: [rawPost('r2', 'r1')],
      nextCursor: 'cursor-page-3',
      hasMore: true,
    });

    const res = await getPostThreadRepliesAction({ postId: 'root', cursor: 'cursor-page-2' });
    if (!res.ok) throw new Error('action en échec');

    expect(goFetch).toHaveBeenCalledWith(
      '/v1/posts/root/replies?scope=thread&limit=50&cursor=cursor-page-2'
    );
    expect(res.data?.replies.map((r) => r.id)).toEqual(['r2']);
    expect(res.data?.replies[0].parentId).toBe('r1');
    expect(res.data?.nextCursor).toBe('cursor-page-3');
    expect(res.data?.hasMore).toBe(true);
  });
});

describe('mergeThreadReplies — rattachement sans perte', () => {
  const root = mapGoThreadToWebThread({
    ...rawPost('root', null),
    replies: [rawPost('r1', 'root')],
    repliesCursor: 'cursor-page-2',
    repliesTruncated: true,
  } as never);

  if (!root) throw new Error('arbre racine non construit');

  const page = [
    rawReply('r2', 'r1'),
    rawReply('r3', 'r2'),
    rawReply('orpheline', 'parent-non-charge'),
  ];

  it('rattache les petits-enfants sous leur parent, même dans la même page', () => {
    const { root: merged, added } = mergeThreadReplies(root, page);

    expect(added).toBe(3);
    expect(merged.replies[0].replies.map((r) => r.id)).toEqual(['r2']);
    expect(merged.replies[0].replies[0].replies.map((r) => r.id)).toEqual(['r3']);
  });

  it('garde visible une réponse dont le parent n’est pas chargé, en la marquant', () => {
    const { root: merged } = mergeThreadReplies(root, page);
    const orpheline = merged.replies.find((r) => r.id === 'orpheline');

    expect(orpheline).toBeDefined();
    expect(orpheline?.parentUnavailable).toBe(true);
  });

  it('ne mute pas l’arbre existant et rejouer une page est sans effet', () => {
    const { root: merged } = mergeThreadReplies(root, page);

    expect(root.replies[0].replies).toEqual([]);

    const replay = mergeThreadReplies(merged, page);
    expect(replay.added).toBe(0);
    expect(replay.root.replies[0].replies.map((r) => r.id)).toEqual(['r2']);
    expect(replay.root.replies.filter((r) => r.id === 'orpheline')).toHaveLength(1);
  });
});
