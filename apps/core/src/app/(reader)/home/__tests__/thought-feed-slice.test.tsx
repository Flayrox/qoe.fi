import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FeedAuthor, FeedItem, FeedItemPost } from '@/lib/feed-types';

vi.mock('@/components/social/ThoughtCard', () => ({
  ThoughtCard: ({
    post,
    reason,
  }: {
    post: { id: string; content: string; repost?: { id: string } | null };
    reason?: { type: string };
  }) => (
    <div
      data-post={post.id}
      data-content={post.content}
      data-reason={reason?.type ?? 'none'}
      data-quoted={post.repost?.id ?? ''}
    />
  ),
}));

import { ThoughtFeedSlice } from '../components/ThoughtFeedSlice';

const author: FeedAuthor = {
  id: 'author_1',
  name: 'Alice',
  username: 'alice',
  logoUrl: null,
  isCertified: false,
};

const post = (id: string, overrides: Partial<FeedItemPost> = {}): FeedItemPost => ({
  id,
  content: `contenu ${id}`,
  imageUrl: null,
  createdAt: '2026-10-22T00:00:00Z',
  author,
  poll: null,
  ...overrides,
});

const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  id: 'slice_1',
  post: post('target_1'),
  ...overrides,
});

const render = (value: FeedItem) => renderToStaticMarkup(<ThoughtFeedSlice item={value} />);

describe('ThoughtFeedSlice — consommation du contrat FeedItem', () => {
  it('racine : rend le post effectif sans contexte', () => {
    const html = render(item());
    expect(html).toContain('data-post="target_1"');
    expect(html).not.toContain('data-post="undefined"');
    expect(html).toContain('data-reason="none"');
  });

  it('réponse : root et parent viennent de reply, le target porte sa raison', () => {
    const html = render(
      item({
        post: post('target_1'),
        reply: { root: post('root_1'), parent: post('parent_1') },
        reason: { type: 'pin', by: author, at: '2026-10-22T00:00:00Z' },
      })
    );
    expect(html).toContain('data-post="root_1"');
    expect(html).toContain('data-post="parent_1"');
    expect(html).toContain('data-post="target_1"');
    expect(html).toContain('data-reason="pin"');
  });

  it('repost pur : le post affiché est l’original et la raison est consommée', () => {
    const html = render(
      item({
        post: post('original_1', { content: 'original' }),
        reason: { type: 'repost', by: author, at: '2026-10-22T00:00:00Z' },
      })
    );
    expect(html).toContain('data-post="original_1"');
    expect(html).toContain('data-reason="repost"');
  });

  it('citation avec texte : le post cité reste porté par le post effectif', () => {
    const html = render(
      item({
        post: post('quote_1', {
          content: 'Mon commentaire',
          repost: { id: 'quoted_1', content: 'cité', author },
        }),
      })
    );
    expect(html).toContain('data-post="quote_1"');
    expect(html).toContain('data-content="Mon commentaire"');
    expect(html).toContain('data-quoted="quoted_1"');
    expect(html).toContain('data-reason="none"');
  });

  it('repost d’article : raison article_repost et article conservé', () => {
    const html = render(
      item({
        post: post('article_repost_1', {
          content: '',
          articleQuote: {
            id: 'art_1',
            title: 'Article repartagé',
            slug: 'article-repartage',
            isPremium: false,
            publisher: null,
            author,
          },
        }),
        reason: { type: 'article_repost', by: author, at: '2026-10-22T00:00:00Z' },
      })
    );
    expect(html).toContain('data-post="article_repost_1"');
    expect(html).toContain('data-reason="article_repost"');
  });
});
