// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  TemplateArticleItem,
  TemplatePublisherContext,
  TemplateRenderContext,
} from '../../schema';
import { ArticleContentBlock } from '../ArticleContentBlock';

const publisher = { name: 'Publication' } as TemplatePublisherContext;
const context = { mode: 'live', article: null } as TemplateRenderContext;
const article = {
  id: 'article-1',
  title: 'Titre',
  slug: 'titre',
  content: '<p>HTML brut</p>',
  excerpt: '',
  readingTime: 1,
  publishedAt: new Date().toISOString(),
  author: { name: 'Auteur' },
} satisfies TemplateArticleItem;

const props = {
  showTitle: false,
  showMeta: false,
  showAuthor: false,
  showDate: false,
  showReadingTime: false,
  showCover: false,
};

describe('ArticleContentBlock — corps canonique', () => {
  it('rend le contenu fourni par l’hôte à la place du HTML brut', () => {
    const html = renderToStaticMarkup(
      <ArticleContentBlock
        id="article-content-block"
        props={props}
        publisher={publisher}
        article={article}
        context={context}
        content={<div data-highlight-id="canonical-body">Corps canonique</div>}
      />
    );

    expect(html).toContain('data-highlight-id="canonical-body"');
    expect(html).toContain('Corps canonique');
    expect(html).not.toContain('HTML brut');
  });

  it('conserve le HTML brut quand aucun contenu canonique n’est fourni', () => {
    const html = renderToStaticMarkup(
      <ArticleContentBlock
        id="article-content-block"
        props={props}
        publisher={publisher}
        article={article}
        context={context}
      />
    );

    expect(html).toContain('HTML brut');
  });
});
