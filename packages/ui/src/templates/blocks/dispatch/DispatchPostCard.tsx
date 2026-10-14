'use client';

// =====================================================================
// DispatchPostCard.tsx — Carte d'article atomique
// =====================================================================
// Découplé, sans logique d'état lourde : optimal pour le rendu live et l'éditeur.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Lock, Clock, Heart, MessageSquare } from 'lucide-react';
import type { TemplateArticleItem } from '../../schema';

export interface DispatchPostCardProps {
  article: TemplateArticleItem;
  variant?: 'feed' | 'lead' | 'compact';
  accentColor?: string;
  showExcerpt?: boolean;
  showImage?: boolean;
  className?: string;
}

function formatDate(val?: string | Date): string {
  if (!val) return '';
  const d = typeof val === 'string' ? new Date(val) : val;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

export function DispatchPostCard({
  article,
  variant = 'feed',
  showExcerpt = true,
  showImage = true,
  className = '',
}: DispatchPostCardProps) {
  const hasImage = Boolean(showImage && article.imageUrl);
  const formattedDate = formatDate(article.publishedAt);
  const articleUrl = `/article/${article.slug}`;

  // Variante LEAD (grande une panoramique)
  if (variant === 'lead') {
    return (
      <article
        data-oid={`dispatch_lead_${article.id}`}
        className={`group flex flex-col pb-8 border-b border-border/60 ${className}`}
      >
        {hasImage && (
          <Link
            href={articleUrl}
            className="block overflow-hidden rounded-lg mb-4 aspect-[16/9] bg-muted/30"
          >
            <img
              src={article.imageUrl!}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          </Link>
        )}
        <div className="flex flex-col gap-2">
          {article.category && (
            <span className="text-xs uppercase tracking-wider font-semibold text-primary">
              {article.category.name}
            </span>
          )}
          <Link href={articleUrl}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {article.title}
            </h2>
          </Link>
          {showExcerpt && article.excerpt && (
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed line-clamp-3">
              {article.excerpt}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground/80 pt-2">
            {formattedDate && <span>{formattedDate}</span>}
            {article.readingTime && (
              <span className="flex items-center gap-1">
                <span>•</span>
                <Clock className="w-3 h-3" />
                {article.readingTime} min
              </span>
            )}
            {article.isPremium && (
              <span className="flex items-center gap-1 text-highlight font-medium">
                <span>•</span>
                <Lock className="w-3 h-3" />
                Réservé
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  // Variante COMPACT (top stories secondaires sans extrait)
  if (variant === 'compact') {
    return (
      <article
        data-oid={`dispatch_compact_${article.id}`}
        className={`group flex items-start gap-4 py-3 border-b border-border/40 last:border-b-0 ${className}`}
      >
        <div className="flex-1 min-w-0">
          <Link href={articleUrl}>
            <h4 className="text-sm sm:text-base font-semibold text-foreground line-clamp-2 transition-colors group-hover:text-primary leading-snug">
              {article.title}
            </h4>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/75 mt-1.5">
            {formattedDate && <span>{formattedDate}</span>}
            {article.readingTime && <span>• {article.readingTime} min</span>}
            {article.isPremium && <Lock className="w-3 h-3 text-highlight" />}
          </div>
        </div>
        {hasImage && (
          <Link
            href={articleUrl}
            className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-muted/30"
          >
            <img
              src={article.imageUrl!}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          </Link>
        )}
      </article>
    );
  }

  // Variante FEED (standard : texte à gauche, vignette 16:9 à droite)
  return (
    <article
      data-oid={`dispatch_feed_${article.id}`}
      className={`group flex items-start justify-between gap-4 sm:gap-6 py-6 border-b border-border/50 last:border-b-0 ${className}`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {article.category && (
          <span className="text-[11px] uppercase tracking-wider font-semibold text-primary/90">
            {article.category.name}
          </span>
        )}
        <Link href={articleUrl}>
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary leading-snug">
            {article.title}
          </h3>
        </Link>
        {showExcerpt && article.excerpt && (
          <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed mt-0.5">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground/80 mt-2">
          {formattedDate && <span>{formattedDate}</span>}
          {article.readingTime && (
            <span className="flex items-center gap-1">
              <span>•</span>
              <Clock className="w-3 h-3" />
              {article.readingTime} min
            </span>
          )}
          {article.isPremium && (
            <span className="flex items-center gap-1 text-highlight font-medium">
              <span>•</span>
              <Lock className="w-3 h-3" />
              Réservé
            </span>
          )}
          <span className="ml-auto hidden sm:flex items-center gap-3 text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
            </span>
          </span>
        </div>
      </div>
      {hasImage && (
        <Link
          href={articleUrl}
          className="flex-shrink-0 w-24 h-16 sm:w-36 sm:h-24 md:w-44 md:h-28 rounded-md overflow-hidden bg-muted/30 shadow-sm"
        >
          <img
            src={article.imageUrl!}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </Link>
      )}
    </article>
  );
}
