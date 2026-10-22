'use client';

// =====================================================================
// ArticleCard.tsx — Composant Atomique Souverain pour les Articles
// =====================================================================
// Centralise l'affichage et les règles d'interaction pour TOUS les modes :
// - 'hero-center' : Vedette centrale Substack (Image haut, centrage parfait)
// - 'secondary'   : Colonnes latérales (Image haut, texte compact)
// - 'row'         : Lignes horizontales d'archives et de rubriques
//
// Avantages architecturaux :
// 1. ZÉRO duplication de styles ou de classes Tailwind.
// 2. Micro-arrondi homogène (rounded-[3px]) garanti sur toutes les images.
// 3. Typographie 100% synchronisée avec le thème (pas de serif forcé).
// 4. Déblocage et affichage de l'engagement au survol (revealOnHover).
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { SafeImage } from '../../SafeImage';
import { getCoverPlaceholder } from '../placeholders';
import { ArticleEngagementBar } from './ArticleEngagementBar';
import type { TemplateArticleItem } from '../schema';
import { cn } from '@qoe/utils';

export type ArticleCardVariant = 'hero-center' | 'secondary' | 'row';

export interface ArticleCardProps {
  article: TemplateArticleItem;
  variant?: ArticleCardVariant;
  publicationName?: string;
  showExcerpts?: boolean;
  showReadingTime?: boolean;
  showCategories?: boolean;
  isPinned?: boolean;
  editableMode?: boolean;
  testId?: string;
  className?: string;
  onQuoteClick?: (article: TemplateArticleItem) => void;
}

export function ArticleCard({
  article,
  variant = 'secondary',
  publicationName,
  showExcerpts = true,
  showReadingTime = true,
  showCategories = true,
  isPinned = false,
  editableMode = false,
  testId,
  className,
  onQuoteClick,
}: ArticleCardProps) {
  const coverUrl = article.imageUrl || getCoverPlaceholder(article.slug || article.id);
  const articleHref = `/article/${article.slug}`;

  const handleLinkClick = (e: React.MouseEvent) => {
    if (editableMode) {
      e.preventDefault();
    }
  };

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const authorName = article.author?.name || publicationName || 'Rédaction';

  // Métadonnées communes réutilisables
  const renderMetaItems = (isCenter = false) => (
    <>
      {isPinned && (
        <span
          className={cn(
            'inline-flex items-center gap-1 font-semibold text-primary',
            isCenter ? 'text-[11px]' : 'text-[10px]'
          )}
        >
          📌 {isCenter ? '' : 'Épinglé'}
        </span>
      )}
      {formattedDate && <span>{formattedDate}</span>}
      <span className="opacity-40">·</span>
      <span>{authorName}</span>
      {showReadingTime && article.readingTime && (
        <>
          <span className="opacity-40">·</span>
          <span>{article.readingTime} min</span>
        </>
      )}
      {showCategories && article.category && (
        <>
          <span className="opacity-40">·</span>
          <span className="text-foreground font-semibold">{article.category.name}</span>
        </>
      )}
      {article.isPremium !== undefined && (
        <span className="px-1.5 py-0.2 rounded-[3px] text-[10px] font-medium bg-muted border border-border/40 text-foreground normal-case">
          {article.isPremium ? 'Payant' : 'Gratuit'}
        </span>
      )}
    </>
  );

  // ===================================================================
  // Variante 1 : HERO CENTER (Disposition Substack centré)
  // ===================================================================
  if (variant === 'hero-center') {
    return (
      <article data-testid={testId} className={cn('group relative space-y-4', className)}>
        {/* 1. Image Vedette en haut avec micro-arrondi */}
        <div className="w-full">
          <Link href={articleHref} onClick={handleLinkClick} className="block group/cover">
            <div className="relative w-full aspect-[16/10] sm:aspect-[16/10] rounded-[3px] overflow-hidden border border-border/50 bg-muted shadow-2xs">
              <SafeImage
                src={coverUrl}
                alt={article.title}
                fill
                className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.01]"
              />
            </div>
          </Link>
        </div>

        {/* 2. Titre centré sous l'image (police synchronisée avec le thème) */}
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground text-center leading-[1.2] hover:opacity-85 transition-opacity">
          <Link href={articleHref} onClick={handleLinkClick}>
            {article.title}
          </Link>
        </h2>

        {/* 3. Extrait centré sous le titre */}
        {showExcerpts && article.excerpt && (
          <p className="text-sm sm:text-base text-muted-foreground text-center max-w-xl mx-auto leading-relaxed line-clamp-3">
            {article.excerpt}
          </p>
        )}

        {/* 4. Métadonnées centrées */}
        <div className="flex flex-col items-center justify-center gap-2.5 pt-2 border-t border-border/20">
          <div className="flex items-center justify-center gap-2 flex-wrap uppercase tracking-wider text-[11px] font-medium text-muted-foreground/80">
            {renderMetaItems(true)}
            {/* Lien d'accessibilité discret pour lecteurs d'écran & tests */}
            <Link href={articleHref} onClick={handleLinkClick} className="sr-only">
              Lire l’article
            </Link>
          </div>

          {/* 5. Barre d'engagement sociale centrée (au survol) */}
          <div className="pt-0.5">
            <ArticleEngagementBar
              articleId={article.id}
              articleSlug={article.slug}
              articleTitle={article.title}
              initialLikes={article.likesCount ?? 0}
              initialComments={article.commentsCount ?? 0}
              initialReposts={article.repostsCount ?? 0}
              initialIsLiked={article.isLiked}
              initialIsReposted={article.isReposted}
              size="sm"
              showShareText={false}
              layout="center"
              revealOnHover={true}
              onQuoteClick={() => onQuoteClick?.(article)}
              className="border-0 py-0"
            />
          </div>
        </div>
      </article>
    );
  }

  // ===================================================================
  // Variante 2 : SECONDARY (Colonnes latérales gauche & droite)
  // ===================================================================
  if (variant === 'secondary') {
    return (
      <article data-testid={testId} className={cn('group relative space-y-3', className)}>
        {/* 1. Image en haut */}
        <Link href={articleHref} onClick={handleLinkClick} className="block group/cover">
          <div className="relative w-full aspect-[16/10] rounded-[3px] overflow-hidden border border-border/50 bg-muted shadow-2xs">
            <SafeImage
              src={coverUrl}
              alt={article.title}
              fill
              className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.03]"
            />
          </div>
        </Link>

        <div className="space-y-1.5">
          {/* 2. Titre sous l'image */}
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-snug hover:opacity-85 transition-opacity line-clamp-2">
            <Link href={articleHref} onClick={handleLinkClick}>
              {article.title}
            </Link>
          </h3>

          {/* 3. Extrait sous le titre */}
          {showExcerpts && article.excerpt && (
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {article.excerpt}
            </p>
          )}

          {/* 4. Métadonnées en bas */}
          <div className="pt-1.5 space-y-2 border-t border-border/20">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 tracking-wide uppercase font-medium flex-wrap">
              {renderMetaItems(false)}
            </div>

            <ArticleEngagementBar
              articleId={article.id}
              articleSlug={article.slug}
              articleTitle={article.title}
              initialLikes={article.likesCount ?? 0}
              initialComments={article.commentsCount ?? 0}
              initialReposts={article.repostsCount ?? 0}
              initialIsLiked={article.isLiked}
              initialIsReposted={article.isReposted}
              size="sm"
              showShareText={false}
              revealOnHover={true}
              onQuoteClick={() => onQuoteClick?.(article)}
              className="border-0 py-0"
            />
          </div>
        </div>
      </article>
    );
  }

  // ===================================================================
  // Variante 3 : ROW (Flux chronologique et sections de rubriques)
  // ===================================================================
  return (
    <article
      data-testid={testId}
      className={cn(
        'group relative flex flex-col sm:flex-row items-start justify-between gap-6 py-6 first:pt-2 last:pb-2 transition-colors',
        className
      )}
    >
      <div className="flex-1 space-y-2 min-w-0">
        {/* Titre */}
        <h4 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug hover:opacity-85 transition-opacity">
          <Link href={articleHref} onClick={handleLinkClick}>
            {article.title}
          </Link>
        </h4>

        {/* Extrait */}
        {showExcerpts && article.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {article.excerpt}
          </p>
        )}

        {/* Métadonnées */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/80 tracking-wide uppercase font-medium flex-wrap pt-0.5">
          {renderMetaItems(false)}
        </div>

        {/* Barre d'engagement sociale */}
        <div className="pt-2 flex items-center justify-start text-xs">
          <ArticleEngagementBar
            articleId={article.id}
            articleSlug={article.slug}
            articleTitle={article.title}
            initialLikes={article.likesCount ?? 0}
            initialComments={article.commentsCount ?? 0}
            initialReposts={article.repostsCount ?? 0}
            initialIsLiked={article.isLiked}
            initialIsReposted={article.isReposted}
            size="sm"
            showShareText={false}
            revealOnHover={true}
            onQuoteClick={() => onQuoteClick?.(article)}
            className="border-0 py-0"
          />
        </div>
      </div>

      {/* Vignette couverture à droite */}
      <Link
        href={articleHref}
        onClick={handleLinkClick}
        className="relative w-full sm:w-44 md:w-48 aspect-[16/10] sm:h-32 shrink-0 rounded-[3px] overflow-hidden bg-muted border border-border/40 group/thumb block"
      >
        <img
          src={coverUrl}
          alt={article.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-[1.03]"
          loading="lazy"
        />
      </Link>
    </article>
  );
}
