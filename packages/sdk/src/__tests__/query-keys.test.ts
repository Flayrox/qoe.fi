import { describe, it, expect } from 'vitest';
import {
  feedKeys,
  userKeys,
  tenantKeys,
  subscriptionKeys,
  recommendationKeys,
  articleKeys,
  commentKeys,
  annotationKeys,
  notificationKeys,
  searchKeys,
  starterPackKeys,
  pollKeys,
  threadgateKeys,
} from '../query-keys';

describe('query-keys — familles de cache TanStack', () => {
  it('feedKeys : hiérarchie et valeurs par défaut', () => {
    expect(feedKeys.all).toEqual(['feed']);
    expect(feedKeys.timeline()).toEqual(['feed', 'timeline', 'for-you']);
    expect(feedKeys.timeline('following')).toEqual(['feed', 'timeline', 'following']);
    expect(feedKeys.userPosts('alice')).toEqual(['feed', 'user', 'alice']);
    expect(feedKeys.thread('t1')).toEqual(['feed', 'thread', 't1']);
    expect(feedKeys.likes('t1')).toEqual(['feed', 'likes', 't1']);
    expect(feedKeys.articles()).toEqual(['feed', 'articles']);
  });

  it('userKeys : profil, followers, following sous la famille users', () => {
    expect(userKeys.all).toEqual(['users']);
    expect(userKeys.profile('bob')).toEqual(['users', 'profile', 'bob']);
    expect(userKeys.followers('bob')).toEqual(['users', 'followers', 'bob']);
    expect(userKeys.following('bob')).toEqual(['users', 'following', 'bob']);
  });

  it('tenantKeys : domaine, articles et article (domaine + slug)', () => {
    expect(tenantKeys.all).toEqual(['tenants']);
    expect(tenantKeys.domain('media-clair')).toEqual(['tenants', 'domain', 'media-clair']);
    expect(tenantKeys.articles('media-clair')).toEqual(['tenants', 'articles', 'media-clair']);
    expect(tenantKeys.article('media-clair', 'slug-x')).toEqual([
      'tenants',
      'article',
      'media-clair',
      'slug-x',
    ]);
  });

  it('subscriptionKeys : email absente → anonymous', () => {
    expect(subscriptionKeys.all).toEqual(['subscriptions']);
    expect(subscriptionKeys.status('c1')).toEqual(['subscriptions', 'status', 'c1', 'anonymous']);
    expect(subscriptionKeys.status('c1', 'a@b.c')).toEqual([
      'subscriptions',
      'status',
      'c1',
      'a@b.c',
    ]);
    expect(subscriptionKeys.tiers('c1')).toEqual(['subscriptions', 'tiers', 'c1']);
  });

  it('recommendationKeys / articleKeys / commentKeys / annotationKeys', () => {
    expect(recommendationKeys.creator('r1')).toEqual(['recommendations', 'creator', 'r1']);
    expect(articleKeys.comments('a1')).toEqual(['articles', 'a1', 'comments']);
    expect(articleKeys.highlights('a1')).toEqual(['articles', 'a1', 'highlights']);
    expect(commentKeys.list('a1')).toEqual(['comments', 'list', 'a1']);
    expect(annotationKeys.article('a1')).toEqual(['annotations', 'article', 'a1']);
  });

  it('notificationKeys : filtre absent → all', () => {
    expect(notificationKeys.all).toEqual(['notifications']);
    expect(notificationKeys.list()).toEqual(['notifications', 'list', 'all']);
    expect(notificationKeys.list('unread')).toEqual(['notifications', 'list', 'unread']);
    expect(notificationKeys.unreadCount()).toEqual(['notifications', 'unreadCount']);
    expect(notificationKeys.preferences()).toEqual(['notifications', 'preferences']);
  });

  it('searchKeys : type absent → all', () => {
    expect(searchKeys.results('q')).toEqual(['search', 'results', 'q', 'all']);
    expect(searchKeys.results('q', 'articles')).toEqual(['search', 'results', 'q', 'articles']);
    expect(searchKeys.trending()).toEqual(['search', 'trending']);
  });

  it('starterPackKeys / pollKeys / threadgateKeys', () => {
    expect(starterPackKeys.list()).toEqual(['starterPacks', 'list']);
    expect(starterPackKeys.detail('sp1')).toEqual(['starterPacks', 'detail', 'sp1']);
    expect(pollKeys.detail('t9')).toEqual(['polls', 'detail', 't9']);
    expect(threadgateKeys.canReply('t9')).toEqual(['threadgates', 'canReply', 't9']);
  });

  it('chaque famille dérive bien de son root (invalidation large possible)', () => {
    // L'invalidation { queryKey: xxxKeys.all } doit couvrir les clés filles :
    // la première élément d'une clé fille est toujours le root.
    expect(feedKeys.timeline()[0]).toBe(feedKeys.all[0]);
    expect(userKeys.profile('x')[0]).toBe(userKeys.all[0]);
    expect(tenantKeys.article('d', 's')[0]).toBe(tenantKeys.all[0]);
    expect(searchKeys.results('q')[0]).toBe(searchKeys.all[0]);
  });
});
