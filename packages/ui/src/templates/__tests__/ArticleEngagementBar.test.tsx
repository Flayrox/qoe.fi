import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArticleEngagementBar } from '../blocks/ArticleEngagementBar';

describe('ArticleEngagementBar', () => {
  it('affiche les boutons de base (J’aime, Commentaires, Republier, Partager)', () => {
    const html = renderToStaticMarkup(
      <ArticleEngagementBar
        articleId="artc_test"
        articleSlug="test-article"
        articleTitle="Article de Test"
      />
    );
    expect(html).toContain('J&#x27;aime');
    expect(html).toContain('Commentaires');
    expect(html).toContain('Republier');
    expect(html).toContain('Partager');
  });

  it('affiche les compteurs de likes, commentaires et reposts quand ils sont supérieurs à 0', () => {
    const html = renderToStaticMarkup(
      <ArticleEngagementBar
        articleId="artc_test"
        articleSlug="test-article"
        initialLikes={42}
        initialComments={7}
        initialReposts={13}
      />
    );
    expect(html).toContain('42');
    expect(html).toContain('7');
    expect(html).toContain('13');
  });

  it('applique les classes actives et aria-labels appropriés quand initialIsLiked et initialIsReposted sont vrais', () => {
    const html = renderToStaticMarkup(
      <ArticleEngagementBar
        articleId="artc_test"
        articleSlug="test-article"
        initialIsLiked={true}
        initialIsReposted={true}
      />
    );
    expect(html).toContain('fill-destructive');
    expect(html).toContain('text-primary');
    expect(html).toContain('Je n&#x27;aime plus');
    expect(html).toContain('Retirer la republication');
  });

  it('gère le mode compact (size="sm") sans afficher le texte Partager', () => {
    const html = renderToStaticMarkup(
      <ArticleEngagementBar
        articleId="artc_test"
        articleSlug="test-article"
        size="sm"
        showShareText={false}
      />
    );
    expect(html).not.toContain('<span>Partager</span>');
    expect(html).toContain('text-xs');
  });

  it('gère le layout centré (layout="center") et le masquage des compteurs hors survol (revealOnHover)', () => {
    const html = renderToStaticMarkup(
      <ArticleEngagementBar
        articleId="artc_test"
        articleSlug="test-article"
        initialLikes={134}
        initialComments={20}
        initialReposts={7}
        layout="center"
        revealOnHover={true}
      />
    );
    expect(html).toContain('justify-center');
    expect(html).toContain('opacity-0');
    expect(html).toContain('group-hover/bar:max-w-xs');
    expect(html).toContain('134');
    expect(html).toContain('20');
    expect(html).toContain('7');
  });
});
