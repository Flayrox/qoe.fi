// ArticleContentBlock.tsx — Contenu de l'article (scope article)

import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import type {
  ArticleContentBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { NodeRenderer } from './NodeRenderer';

interface ArticleContentBlockComponentProps {
  id: string;
  props: ArticleContentBlockProps;
  publication: TemplatePublicationContext;
  article?: TemplateArticleItem | null;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

function sanitizeArticleHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'b',
      'i',
      'em',
      'strong',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'img',
      'figure',
      'figcaption',
      'hr',
      'div',
      'span',
      'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id', 'loading'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  });
}

export function ArticleContentBlock({
  id,
  props,
  publication,
  article: articleProp,
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: ArticleContentBlockComponentProps) {
  const {
    showTitle = true,
    showMeta = true,
    showAuthor = true,
    showDate = true,
    showReadingTime = true,
    showCover = true,
  } = props;

  const article: TemplateArticleItem | null = articleProp ??
    context.article ?? {
      id: 'demo_article',
      title: "Titre de l'article",
      slug: 'demo-article',
      content: '',
      excerpt: '',
      readingTime: 4,
      publishedAt: new Date().toISOString(),
      author: { name: publication.name || 'Auteur' },
    };

  const authorName = article.author?.name || article.author?.username || publication.name || '';
  const safeHtml = sanitizeArticleHtml(article.content || '');

  return (
    <BlockWrapper
      id={id}
      type="article-content"
      label="Contenu article"
      visible={visible}
      locked={locked}
      context={context}
      styleBox={
        (
          props as unknown as {
            styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
          }
        ).styleBox
      }
      blockStyle={(props as unknown as { style?: import('../schema').BlockStyleProps }).style}
      hiddenAt={hiddenAt}
    >
      <article className="container mx-auto px-4 lg:px-8 py-10 md:py-14 max-w-3xl">
        {slots?.before && (
          <NodeRenderer
            nodes={slots.before}
            blockId={id}
            blockProps={props as unknown as Record<string, unknown>}
            context={context}
            path="slots/before"
          />
        )}
        {showTitle && article.title && (
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{article.title}</h1>
        )}
        {showMeta && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {showAuthor && authorName && (
              <span className="font-medium text-foreground">{authorName}</span>
            )}
            {showDate && article.publishedAt && (
              <time>
                {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </time>
            )}
            {showReadingTime && article.readingTime ? <span>{article.readingTime} min</span> : null}
          </div>
        )}
        {showCover && article.imageUrl && (
          <img
            src={article.imageUrl}
            alt={article.title}
            className="mt-6 w-full rounded-lg object-cover"
            loading="lazy"
          />
        )}
        {safeHtml && (
          <div
            className="prose-custom mt-8 leading-relaxed [&>p]:mb-4 [&>h2]:mt-8 [&>h2]:mb-3 [&>h2]:text-2xl [&>h2]:font-bold [&>ul]:mb-4 [&>ul]:list-disc [&>ul]:pl-6 [&>blockquote]:border-l-2 [&>blockquote]:pl-4 [&>blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        )}
        {slots?.after && (
          <div className="mt-8">
            <NodeRenderer
              nodes={slots.after}
              blockId={id}
              blockProps={props as unknown as Record<string, unknown>}
              context={context}
              path="slots/after"
            />
          </div>
        )}
        {nodes && nodes.length > 0 && (
          <NodeRenderer
            nodes={nodes}
            blockId={id}
            blockProps={props as unknown as Record<string, unknown>}
            context={context}
            path="nodes"
          />
        )}
      </article>
    </BlockWrapper>
  );
}
