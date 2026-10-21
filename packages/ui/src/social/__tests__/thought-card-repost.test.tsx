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
    publication: { name: 'Revue Bob', subdomain: 'revue-bob', customDomain: null },
  },
};

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
