'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { ArrowUpRight } from 'lucide-react';

export interface QuoteContextData {
  before: string;
  highlight: string;
  after: string;
  start: number;
  end: number;
  sha: string;
}

export interface QuotedArticleData {
  id: string;
  title: string;
  slug: string;
  isPremium?: boolean;
  content?: string | null;
  // Contexte du passage résolu côté serveur (texte canonique de l'article) :
  // la carte n'a plus à stripper le HTML ni à re-chercher l'extrait.
  quoteContext?: QuoteContextData | null;
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

  // 1) Contexte serveur (texte canonique, passages résolus par le backend) —
  //    chemin privilégié : zéro strip HTML, zéro indexOf.
  const serverContext = article.quoteContext;
  const beforeContext = serverContext?.before ?? '';
  let highlightedText = serverContext?.highlight ?? '';
  let afterContext = serverContext?.after ?? '';

  // 2) Repli : aucun contexte serveur mais un extrait — chip sans contexte.
  if (!serverContext && quotedExcerpt) {
    highlightedText = quotedExcerpt.replace(/\s+/g, ' ').trim();
    afterContext = '';
  }

  // 3) Dernier filet (composeur, preview client) : le HTML brut est encore
  //    disponible et l'extrait absent — on affiche le début du texte.
  if (!serverContext && !quotedExcerpt) {
    const rawText = article.content
      ? article.content
          .replace(/<[^>]*>/gm, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
    if (rawText) {
      highlightedText = rawText.substring(0, 130);
      afterContext = rawText.length > 130 ? '...' : '';
    }
  }

  // 🔦 Deep-link (tranche 6-b) : le passage cité est transmis par query
  // params (hlStart/hlEnd/hlSha) — l'article s'ouvre sur le passage exact.
  const quoteParams = serverContext
    ? `?hlStart=${serverContext.start}&hlEnd=${serverContext.end}&hlSha=${encodeURIComponent(
        serverContext.sha
      )}`
    : '';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenArticle) {
      // Le drawer extrait le quoteContext de l'article pour le spotlight.
      onOpenArticle(article);
    } else {
      const url = articleDomain
        ? `https://${articleDomain}/article/${article.slug}${quoteParams}`
        : `/article/${article.slug}${quoteParams}`;
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
