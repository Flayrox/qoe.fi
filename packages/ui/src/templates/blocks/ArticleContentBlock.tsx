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
      <article className="container mx-auto px-4 sm:px-6 py-6 md:py-10 max-w-[680px] relative">
        {slots?.before && (
          <NodeRenderer
            nodes={slots.before}
            blockId={id}
            blockProps={props as unknown as Record<string, unknown>}
            context={context}
            path="slots/before"
          />
        )}

        {showMeta && (
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground mb-4 select-none">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: 'var(--tenant-accent, #F97316)' }}
              aria-hidden="true"
            />
            {showAuthor && authorName && (
              <span className="font-semibold text-foreground/90">{authorName}</span>
            )}
            {showDate && article.publishedAt && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <time
                  dateTime={
                    article.publishedAt instanceof Date
                      ? article.publishedAt.toISOString()
                      : article.publishedAt
                  }
                >
                  {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </>
            )}
            {showReadingTime && article.readingTime ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{article.readingTime} min</span>
              </>
            ) : null}
          </div>
        )}

        {showTitle && article.title && (
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-snug">
            {article.title}
          </h1>
        )}

        {showCover && article.imageUrl && (
          <div className="mt-8 mb-8 -mx-4 sm:-mx-8 md:-mx-12">
            <div className="relative aspect-[16/9] sm:aspect-[2/1] rounded-2xl overflow-hidden border border-border/40 bg-muted/30 shadow-2xs">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {safeHtml && (
          <div
            id="article-content"
            className="prose-custom mt-8 leading-relaxed text-foreground/90 font-sans text-base sm:text-[17px] [&>p]:mb-6 [&>p]:leading-relaxed [&>h2]:mt-12 [&>h2]:mb-4 [&>h2]:text-xl sm:[&>h2]:text-2xl [&>h2]:font-bold [&>h2]:tracking-tight [&>h3]:mt-8 [&>h3]:mb-3 [&>h3]:text-lg [&>h3]:font-semibold [&>ul]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>blockquote]:border-l-2 [&>blockquote]:border-[var(--tenant-accent)] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>code]:bg-muted/70 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-xs [&>code]:font-sans"
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
