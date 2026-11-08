// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@lingui/core/macro', () => ({
  t: (str: unknown) => (Array.isArray(str) ? str[0] : String(str || '')),
}));

import { ArticleCard } from '../ArticleCard';
import { AuthModalProvider } from '../auth/AuthModalContext';
import { getArticleShadow, getActorShadow, updateArticleShadow, updateActorShadow } from '@qoe/sdk';
import type { FeedArticleDTO } from '@qoe/sdk/types';

describe('ArticleCard — mutations optimistes avec withShadowMutation', () => {
  const baseArticle: FeedArticleDTO = {
    id: 'art-mut-1',
    title: 'Article Mutation Optimiste',
    content: '<p>Contenu du test</p>',
    slug: 'article-mutation-optimiste',
    published: true,
    readingTime: 3,
    isPremium: false,
    category: null,
    createdAt: '2026-11-08T10:00:00.000Z',
    author: {
      id: 'author-mut-1',
      name: 'Auteur Test',
      username: 'auteur_test',
      logoUrl: null,
      isCertified: false,
      type: 'PERSONAL',
      subdomain: null,
      customDomain: null,
      heroText: null,
    },
  };

  beforeEach(() => {
    // Réinitialise le shadow store pour l'article et l'auteur
    updateArticleShadow('art-mut-1', { bookmarked: false, liked: false, reposted: false });
    updateActorShadow('author-mut-1', { followed: false });
    updateActorShadow('auteur_test', { followed: false });
  });

  it('rollback automatique du signet si handleBookmarkToggle échoue', async () => {
    const handleBookmarkToggle = vi.fn().mockRejectedValue(new Error('Erreur signet'));

    const { getByTitle } = render(
      <AuthModalProvider isAuthenticated={true}>
        <ArticleCard
          article={{ ...baseArticle, isBookmarked: false }}
          handleBookmarkToggle={handleBookmarkToggle}
        />
      </AuthModalProvider>
    );

    const bookmarkBtn = getByTitle('Mettre en signet');
    fireEvent.click(bookmarkBtn);

    expect(handleBookmarkToggle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getArticleShadow('art-mut-1')?.bookmarked).toBe(false);
    });
  });

  it('rollback automatique de l’abonnement auteur si handleFollowToggle échoue', async () => {
    const handleFollowToggle = vi.fn().mockRejectedValue(new Error('Erreur follow'));

    const { getByText } = render(
      <AuthModalProvider isAuthenticated={true}>
        <ArticleCard
          article={{ ...baseArticle }}
          dbUser={{ id: 'user-connected' }}
          isFollowedAuthor={true}
          handleFollowToggle={handleFollowToggle}
        />
      </AuthModalProvider>
    );

    const followBtn = getByText('Suivre');
    fireEvent.click(followBtn);

    expect(handleFollowToggle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getActorShadow('author-mut-1')?.followed).toBe(false);
    });
  });

  it('rollback automatique du like si onLikeToggle échoue', async () => {
    const onLikeToggle = vi.fn().mockRejectedValue(new Error('Erreur like'));

    const { getByTitle } = render(
      <AuthModalProvider isAuthenticated={true}>
        <ArticleCard article={{ ...baseArticle, liked: false }} onLikeToggle={onLikeToggle} />
      </AuthModalProvider>
    );

    const likeBtn = getByTitle('Aimer');
    fireEvent.click(likeBtn);

    expect(onLikeToggle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getArticleShadow('art-mut-1')?.liked).toBe(false);
    });
  });

  it('rollback automatique de la republication si onRepostToggle échoue', async () => {
    const onRepostToggle = vi.fn().mockRejectedValue(new Error('Erreur repost'));

    const { getByRole, findByRole } = render(
      <AuthModalProvider isAuthenticated={true}>
        <ArticleCard
          article={{ ...baseArticle, reposted: false }}
          onRepostToggle={onRepostToggle}
        />
      </AuthModalProvider>
    );

    const repostTrigger = getByRole('button', { name: 'Repartager' });
    fireEvent.click(repostTrigger);

    const repostItem = await findByRole('button', { name: 'Repartager' });
    fireEvent.click(repostItem);

    expect(onRepostToggle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getArticleShadow('art-mut-1')?.reposted).toBe(false);
    });
  });

  it('maintient l’état optimiste en cas de succès de la mutation', async () => {
    const handleBookmarkToggle = vi.fn().mockResolvedValue(undefined);
    const onLikeToggle = vi.fn().mockResolvedValue(undefined);

    const { getByTitle } = render(
      <AuthModalProvider isAuthenticated={true}>
        <ArticleCard
          article={{ ...baseArticle, isBookmarked: false, liked: false }}
          handleBookmarkToggle={handleBookmarkToggle}
          onLikeToggle={onLikeToggle}
        />
      </AuthModalProvider>
    );

    const bookmarkBtn = getByTitle('Mettre en signet');
    fireEvent.click(bookmarkBtn);

    const likeBtn = getByTitle('Aimer');
    fireEvent.click(likeBtn);

    expect(handleBookmarkToggle).toHaveBeenCalledTimes(1);
    expect(onLikeToggle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(getArticleShadow('art-mut-1')?.bookmarked).toBe(true);
      expect(getArticleShadow('art-mut-1')?.liked).toBe(true);
    });
  });
});
