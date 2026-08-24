import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QoeApiClient } from '../client';

// Contrat d'URL de toutes les méthodes publiques du client : chaque entrée
// appelle la méthode avec des args minimaux et vérifie le chemin + la
// méthode HTTP réellement envoyés. Détecte immédiatement une faute de
// frappe dans un path ou une bascule GET/POST involontaire.
const mockFetch = vi.fn();

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

describe('QoeApiClient — contrat d’URL des 41 méthodes', () => {
  let client: QoeApiClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(ok({ data: {} }));
    client = new QoeApiClient({ baseUrl: 'https://api.qoe.fi' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function expectCall(
    run: () => Promise<unknown>,
    expectedPath: string,
    expectedMethod = 'GET'
  ) {
    await run();
    const [url, init] = mockFetch.mock.calls.at(-1)!;
    const path = (url as string).replace('https://api.qoe.fi', '');
    expect(path, `path pour ${String(init?.method ?? 'GET')}`).toBe(expectedPath);
    expect(init?.method ?? 'GET').toBe(expectedMethod);
  }

  it('feed & contenu', async () => {
    await expectCall(() => client.getFeed(), '/v1/feed');
    await expectCall(() => client.getTrendingFeed({ limit: 5 }), '/v1/feed/trending?limit=5');
    await expectCall(() => client.getFeedArticles({ cursor: 'c' }), '/v1/feed/articles?cursor=c');
    await expectCall(() => client.getThread('t1'), '/v1/posts/t1/thread');
    await expectCall(() => client.getThought('t1'), '/v1/posts/t1');
    await expectCall(() => client.createThought('coucou', { tags: ['x'] }), '/v1/posts', 'POST');
    await expectCall(() => client.replyToThought('t1', 'réponse'), '/v1/posts/t1/reply', 'POST');
    await expectCall(() => client.getPostLikes('t1'), '/v1/posts/t1/likes');
    await expectCall(() => client.getPostReposts('t1'), '/v1/posts/t1/reposts');
    await expectCall(() => client.getPostQuotes('t1'), '/v1/posts/t1/quotes');
  });

  it('modération & signalements', async () => {
    await expectCall(() => client.toggleBlockUser('u1'), '/v1/users/u1/block', 'POST');
    await expectCall(() => client.toggleMuteUser('u1'), '/v1/users/u1/mute', 'POST');
    await expectCall(
      () => client.createReport({ targetId: 't1', targetType: 'thought', reason: 'spam' }),
      '/v1/reports',
      'POST'
    );
  });

  it('engagements (like, repost, poll, bookmark, suppression, pin)', async () => {
    await expectCall(() => client.toggleLike('t1'), '/v1/posts/t1/like', 'POST');
    await expectCall(() => client.toggleRepost('t1'), '/v1/posts/t1/repost', 'POST');
    await expectCall(() => client.votePoll('t1', 'opt2'), '/v1/posts/t1/poll/vote', 'POST');
    await expectCall(() => client.unvotePoll('t1'), '/v1/posts/t1/poll/unvote', 'POST');
    await expectCall(() => client.toggleBookmark('a1', 'article'), '/v1/posts/a1/bookmark', 'POST');
    await expectCall(() => client.deleteThought('t1'), '/v1/posts/t1', 'DELETE');
    await expectCall(() => client.togglePin('t1'), '/v1/posts/t1/pin', 'POST');
  });

  it('recherche & notifications', async () => {
    await expectCall(() => client.searchArticles('qoe'), '/search/articles?q=qoe');
    await expectCall(
      () => client.getNotifications({ filter: 'unread' }),
      '/v1/notifications?filter=unread'
    );
    await expectCall(() => client.getUnreadNotificationCount(), '/v1/notifications/unread-count');
    await expectCall(
      () => client.markNotificationsRead(['n1', 'n2']),
      '/v1/notifications/read',
      'POST'
    );
    await expectCall(() => client.markNotificationsRead(), '/v1/notifications/read', 'POST');
  });

  it('profils & social graph', async () => {
    await expectCall(() => client.getMyProfile(), '/v1/users/me');
    await expectCall(() => client.getUserProfile('alice'), '/v1/users/alice');
    await expectCall(() => client.getProfileArticles('alice'), '/v1/users/alice/articles');
    await expectCall(() => client.getUserPosts('alice'), '/v1/users/alice/posts');
    await expectCall(() => client.getUserFollowers('alice'), '/v1/users/alice/followers');
    await expectCall(() => client.getUserFollowing('alice'), '/v1/users/alice/following');
    await expectCall(
      () => client.toggleFollowUser('pub1'),
      // ⚠️ Quirk du contrat actuel : l'arg s'appelle publicationId mais
      // la route réelle est /v1/users/{id}/follow.
      '/v1/users/pub1/follow',
      'POST'
    );
  });

  it('articles & surlignages', async () => {
    await expectCall(
      () => client.getArticle('mon-slug', 'pub1'),
      '/v1/articles/mon-slug?publicationId=pub1'
    );
    await expectCall(() => client.getSimilarArticles('a1'), '/v1/articles/a1/similar?limit=6');
    await expectCall(() => client.getBookmarks(), '/v1/bookmarks');
    await expectCall(() => client.getMyHighlights(), '/v1/me/highlights');
    await expectCall(() => client.getArticleHighlights('a1'), '/v1/articles/a1/highlights');
    await expectCall(
      () => client.createHighlight('a1', { text: 'extrait' }),
      '/v1/articles/a1/highlights',
      'POST'
    );
    await expectCall(() => client.deleteHighlight('h1'), '/v1/highlights/h1', 'DELETE');
    await expectCall(() => client.toggleHighlightUpvote('h1'), '/v1/highlights/h1/upvote', 'POST');
    await expectCall(() => client.getHighlightComments('h1'), '/v1/highlights/h1/comments');
    await expectCall(
      () => client.createHighlightComment('h1', 'note'),
      '/v1/highlights/h1/comments',
      'POST'
    );
  });
});
