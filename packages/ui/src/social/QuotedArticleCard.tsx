'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { ArrowUpRight } from 'lucide-react';

export interface QuotedArticleData {
  id: string;
  title: string;
  slug: string;
  isPremium?: boolean;
  content?: string | null;
  author?: {
    name?: string | null;
    username?: string | null;
    subdomain?: string | null;
  } | null;
  publication?: {
    name?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
  } | null;
}

export interface QuotedArticleCardProps {
  article: QuotedArticleData;
  quotedExcerpt?: string;
  onOpenArticle?: (article: QuotedArticleData) => void;
  className?: string;
}

export function QuotedArticleCard({
  article,
  quotedExcerpt,
  onOpenArticle,
  className,
}: QuotedArticleCardProps) {
  const authorName = article.author?.name || article.author?.username || 'Auteur';
  const articleDomain =
    article.author?.subdomain ||
    article.publication?.subdomain ||
    article.publication?.customDomain;
  const subdomain = articleDomain ? articleDomain.replace(/^https?:\/\//, '') : 'qoe.fi';

  const rawText = article.content
    ? article.content
        .replace(/<[^>]*>/gm, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  const highlightTarget = quotedExcerpt?.replace(/\s+/g, ' ').trim() || '';

  let beforeContext = '';
  let highlightedText = '';
  let afterContext = '';

  const highlightIndex = highlightTarget ? rawText.indexOf(highlightTarget) : -1;
  if (highlightIndex >= 0) {
    const contextLength = 90;
    const startCandidate = Math.max(0, highlightIndex - contextLength);
    const startIdx = startCandidate === 0 ? 0 : rawText.indexOf(' ', startCandidate) + 1;
    const endCandidate = Math.min(
      rawText.length,
      highlightIndex + highlightTarget.length + contextLength
    );
    const nextSpace = rawText.indexOf(' ', endCandidate);
    const endIdx = nextSpace === -1 ? rawText.length : nextSpace;

    beforeContext = rawText.substring(startIdx, highlightIndex).trim();
    if (startIdx > 0) beforeContext = `... ${beforeContext}`;

    highlightedText = rawText.substring(highlightIndex, highlightIndex + highlightTarget.length);
    afterContext = rawText.substring(highlightIndex + highlightTarget.length, endIdx).trim();
    if (endIdx < rawText.length) afterContext = `${afterContext}...`;
  } else if (highlightTarget) {
    highlightedText = quotedExcerpt?.trim() || highlightTarget;
    afterContext = rawText ? ` ... ${rawText.substring(0, 100)}...` : '';
  } else if (rawText) {
    highlightedText = rawText.substring(0, 130);
    afterContext = rawText.length > 130 ? '...' : '';
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenArticle) {
      onOpenArticle(article);
    } else {
      const url = articleDomain
        ? `https://${articleDomain}/article/${article.slug}`
        : `/article/${article.slug}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group/quote relative border border-border/30 hover:border-border/60 bg-muted/20 hover:bg-muted/35 rounded-xl p-4 transition-all duration-200 cursor-pointer space-y-3 font-sans select-none my-2.5',
        className
      )}
    >
      {/* Quiet Left Hairline Accent Indicator */}
      <div className="absolute top-3 bottom-3 left-0 w-[3px] bg-brand/80 rounded-r-full" />

      {/* Clean Header: Domain & Type */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground min-w-0">
          <span className="font-semibold text-foreground truncate">{subdomain}</span>
          <span className="opacity-40">·</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
            Article
          </span>
          {article.isPremium && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-highlight/15 text-highlight border border-highlight/30 shrink-0">
              Premium
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover/quote:text-brand transition-colors shrink-0">
          <span>Ouvrir</span>
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover/quote:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Article Title */}
      <h4 className="text-base font-semibold text-foreground tracking-tight leading-snug group-hover/quote:text-brand transition-colors">
        {article.title}
      </h4>

      {/* Integrated Quoted Excerpt (Rauno Craft Style: No Boxception, No Fluorescent Yellow) */}
      {highlightedText && (
        <div className="relative pl-3 border-l-2 border-brand/50 py-0.5 space-y-1">
          <p className="text-xs sm:text-sm font-serif leading-relaxed text-foreground/90 italic">
            {beforeContext && (
              <span className="text-muted-foreground/60 not-italic">{beforeContext} </span>
            )}
            <mark className="font-medium text-foreground not-italic bg-highlight/20 dark:bg-highlight/30 px-1 py-0.5 rounded">
              {highlightedText}
            </mark>
            {afterContext && (
              <span className="text-muted-foreground/60 not-italic"> {afterContext}</span>
            )}
          </p>
        </div>
      )}

      {/* Footer Credit & Action */}
      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/20 text-muted-foreground">
        <div>
          Par <span className="font-medium text-foreground">{authorName}</span>
        </div>

        <div className="flex items-center gap-1 font-medium text-xs text-brand group-hover/quote:translate-x-0.5 transition-transform">
          <span>Lire l'article</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}
