import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThoughtCard, type ThoughtData } from '../ThoughtCard';

const basePost: ThoughtData = {
  id: 'post_1',
  content: '',
  createdAt: '2026-10-22T00:00:00Z',
  author: {
    id: 'user_reposter',
    name: 'Alice',
    username: 'alice',
    logoUrl: null,
    isCertified: false,
  },
  articleQuote: {
    id: 'artc_1',
    title: 'Souveraineté des médias indépendants',
    slug: 'souverainete-medias-independants',
    author: { name: 'Bob', username: 'bob', subdomain: 'bob' },
    publisher: { name: 'Revue Bob', subdomain: 'revue-bob', customDomain: null },
  },
};

const reposter = {
  id: 'user_reposter',
  name: 'Alice',
  username: 'alice',
  logoUrl: null,
  isCertified: false,
};

describe('ThoughtCard - raison fournie par FeedItem', () => {
  it('repost : bannière du reposteur et post effectif original', () => {
    const original: ThoughtData = {
      id: 'post_original',
      content: 'Texte original',
      createdAt: '2026-10-22T00:00:00Z',
      author: { id: 'user_original', name: 'Bob', username: 'bob', logoUrl: null },
    };
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={original}
        reason={{ type: 'repost', by: reposter, at: '2026-10-22T01:00:00Z' }}
        currentUserId="other"
      />
    );
    expect(html).toContain('data-repost-banner');
    expect(html).toContain('@alice');
    expect(html).toContain('Texte original');
  });

  it('article_repost : bannière sans redériver depuis le contenu', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={basePost}
        reason={{ type: 'article_repost', by: reposter, at: '2026-10-22T01:00:00Z' }}
        currentUserId="other"
      />
    );
    expect(html).toContain('data-repost-banner');
    expect(html).toContain('Souveraineté des médias indépendants');
  });

  it('pin : badge épinglé piloté par la raison', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard
        post={{ ...basePost, articleQuote: null, content: 'Pensée épinglée' }}
        reason={{ type: 'pin', by: basePost.author, at: '2026-10-22T01:00:00Z' }}
      />
    );
    expect(html).toContain('Épinglé');
  });
});

describe('ThoughtCard - Article Repost', () => {
  it('affiche la bannière de repost pur d’article avec @username a repartagé', () => {
    const html = renderToStaticMarkup(<ThoughtCard post={basePost} currentUserId="other_user" />);
    expect(html).toContain('@alice');
    expect(html).toContain('a repartagé');
    expect(html).toContain('Souveraineté des médias indépendants');
  });

  it('affiche la bannière avec "que vous suivez a repartagé" quand isFollowingAuthor est vrai', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard post={basePost} currentUserId="other_user" isFollowingAuthor={true} />
    );
    expect(html).toContain('@alice');
    expect(html).toContain('que vous suivez a repartagé');
  });

  it('affiche "Vous avez repartagé" quand l’utilisateur connecté est l’auteur du repost', () => {
    const html = renderToStaticMarkup(
      <ThoughtCard post={basePost} currentUserId="user_reposter" />
    );
    expect(html).toContain('Vous avez repartagé');
  });
});
