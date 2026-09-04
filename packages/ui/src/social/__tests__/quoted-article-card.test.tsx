import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuotedArticleCard, type QuotedArticleData } from '../QuotedArticleCard';

const baseArticle: QuotedArticleData = {
  id: 'art_1',
  title: 'Un article',
  slug: 'un-article',
  author: { name: 'Alice', username: 'alice', subdomain: 'alice' },
  publication: { name: 'Pub', subdomain: 'pub', customDomain: null },
};

describe('QuotedArticleCard', () => {
  it('rend le contexte serveur (avant / extrait / après) sans strip HTML', () => {
    const article: QuotedArticleData = {
      ...baseArticle,
      // Le contenu HTML brut est même absent — la carte n'en a plus besoin.
      content: null,
      quoteContext: {
        before: '… contexte avant',
        highlight: 'le passage cité',
        after: 'contexte après …',
        start: 42,
        end: 58,
        sha: 'abc123',
      },
    };
    const html = renderToStaticMarkup(
      <QuotedArticleCard article={article} quotedExcerpt="le passage cité" />
    );
    expect(html).toContain('contexte avant');
    expect(html).toContain('le passage cité');
    expect(html).toContain('contexte après');
    // Aucune balise HTML brute ne doit fuiter dans le rendu.
    expect(html).not.toContain('<p>');
  });

  it('ne fait pas d’indexOf quand le contexte serveur est présent même si l’extrait diffère', () => {
    const article: QuotedArticleData = {
      ...baseArticle,
      content: null,
      quoteContext: {
        before: '',
        highlight: 'texte résolu par le serveur',
        after: '',
        start: 0,
        end: 27,
        sha: 'abc',
      },
    };
    const html = renderToStaticMarkup(
      <QuotedArticleCard article={article} quotedExcerpt="extrait brut du client" />
    );
    expect(html).toContain('texte résolu par le serveur');
    expect(html).not.toContain('extrait brut du client');
  });

  it('repli chip : contexte absent mais extrait → extrait sans contexte', () => {
    const html = renderToStaticMarkup(
      <QuotedArticleCard article={baseArticle} quotedExcerpt="extrait seul" />
    );
    expect(html).toContain('extrait seul');
  });

  it('filet final : ni contexte ni extrait → début du contenu (composeur)', () => {
    const article: QuotedArticleData = {
      ...baseArticle,
      content: '<p>Premier paragraphe de l’article avec du contenu réel.</p>',
    };
    const html = renderToStaticMarkup(<QuotedArticleCard article={article} />);
    expect(html).toContain('Premier paragraphe');
    expect(html).not.toContain('<p>');
  });
});
