'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { CornerDownRight } from 'lucide-react';
import { SafeAvatar } from '../SafeAvatar';
import { SafeImage } from '../SafeImage';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { TextParser } from '../ui/TextParser';
import { ProfileHoverCard } from './ProfileHoverCard';
import { QuotedArticleCard, type QuotedArticleData } from './QuotedArticleCard';
import type { AnnotationCitation } from '../annotations/citation';
import { getThoughtUrl } from '@qoe/config';

/**
 * Profondeur maximale dessinée. Une chaîne réelle tient en trois maillons
 * (la pensée, celle qu'elle cite, celle que la citation cite encore) ;
 * au-delà, on résume au lieu d'indenter à l'infini.
 */
const MAX_QUOTE_DEPTH = 2;

/**
 * Une pensée citée. `repost` est récursif : citer une citation n'est pas un
 * cas dégénéré, c'est un troisième point de vue. La carte d'article et
 * l'annotation voyagent avec chaque maillon — sans quoi une citation
 * d'article perdue au deuxième niveau ressemblerait à une pensée orpheline.
 */
export interface QuotedThoughtData {
  id: string;
  content: string;
  imageUrl?: string | null;
  attachments?: Array<{ id?: string; url: string; type?: string; altText?: string | null }> | null;
  createdAt?: string | Date;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  };
  /** Maillon suivant de la chaîne de citations. */
  repost?: QuotedThoughtData | null;
  /** Article cité par ce maillon. */
  articleQuote?: QuotedArticleData | null;
  /** Annotation citée par ce maillon. */
  annotationQuote?: AnnotationCitation | null;
  quotedExcerpt?: string | null;
}

function getQuotedImages(
  imageUrl?: string | null,
  attachments?: QuotedThoughtData['attachments']
): Array<{ url: string; altText: string }> {
  if (attachments && attachments.length > 0) {
    return attachments
      .filter((item) => Boolean(item?.url))
      .map((item) => ({ url: item.url, altText: item.altText ?? '' }));
  }
  if (!imageUrl) return [];
  if (imageUrl.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(imageUrl);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((url) => ({ url: String(url), altText: '' }));
      }
    } catch {
      return [{ url: imageUrl, altText: '' }];
    }
  }
  return [{ url: imageUrl, altText: '' }];
}

export interface QuotedThoughtCardProps {
  post: QuotedThoughtData | null;
  onOpenPost?: (postId: string, authorUsername?: string) => void;
  /** 0 = citation directe, 1+ = maillon d'une chaîne. */
  depth?: number;
  className?: string;
}

/**
 * Une seule carte pour toute la chaîne : le premier maillon porte la
 * surface (bord, fond, rayon), les suivants s'accrochent à un filet de
 * marque. Deux boîtes imbriquées donneraient l'impression d'un collage.
 */
export function QuotedThoughtCard({
  post,
  onOpenPost,
  depth = 0,
  className,
}: QuotedThoughtCardProps) {
  if (!post) return null;

  const nested = depth > 0;
  const author = post.author;
  // Le handle public sert à la fois d'affichage et de destination. Un compte
  // sans nom ni handle garde un libellé neutre : huit caractères d'UUID au
  // milieu d'une citation ne sont pas une identité.
  const publicHandle = author?.username || author?.subdomain || '';
  const authorHandle = publicHandle || author?.id?.slice(0, 8) || 'auteur';
  const authorName = author?.name || (publicHandle ? `@${publicHandle}` : t`Auteur`);

  const content = post.content?.trim() ?? '';
  const innerThought = post.repost ?? null;
  const article = post.articleQuote ?? null;
  const citation = post.annotationQuote ?? null;
  const images = getQuotedImages(post.imageUrl, post.attachments);
  // Un maillon sans texte, sans image et sans rien à citer ne doit pas
  // produire une boîte vide : c'est exactement le cas d'une pensée
  // supprimée entre deux chargements.
  const isMissing = !content && images.length === 0 && !article && !citation && !innerThought;

  const open = (event: { preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
    if (onOpenPost) {
      onOpenPost(post.id, authorHandle);
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.assign(getThoughtUrl(authorHandle, post.id));
    }
  };

  // Seul le premier maillon est un bouton : un bouton dans un bouton n'est
  // pas une hiérarchie, c'est un piège au clavier. Les maillons suivants
  // restent du contexte lisible ; l'article cité, lui, garde son lien.
  const handleClick = (event: React.MouseEvent) => {
    if (nested) return;
    open(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (nested) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open(event);
  };

  return (
    <div
      data-quoted-thought={post.id}
      data-quote-depth={depth}
      role={nested ? undefined : 'button'}
      tabIndex={nested ? undefined : 0}
      aria-label={nested ? undefined : t`Ouvrir la pensée citée`}
      onClick={nested ? undefined : handleClick}
      onKeyDown={nested ? undefined : handleKeyDown}
      className={cn(
        'font-sans select-none space-y-2 text-left',
        nested
          ? 'mt-2 border-l-2 border-brand/30 pl-3'
          : 'mt-2.5 cursor-pointer rounded-xl border border-border/40 bg-muted/20 p-3 shadow-2xs transition-all duration-200 hover:border-brand/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-hidden',
        className
      )}
    >
      {/* Auteur du maillon — même identité que le reste de l'application :
          SafeAvatar déduit le cercle d'une personne et le carré d'un média. */}
      <div className="flex min-w-0 items-center gap-2">
        <SafeAvatar
          id={author?.id}
          src={author?.logoUrl}
          name={authorName}
          username={authorHandle}
          type={author?.type}
          size={nested ? 18 : 24}
          className={cn(nested ? 'border border-border/40' : 'border border-border/30')}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ProfileHoverCard user={author} username={authorHandle}>
            <span
              className={cn(
                'truncate font-bold text-foreground transition-colors hover:text-brand',
                nested ? 'text-[11px]' : 'text-xs'
              )}
            >
              {authorName}
            </span>
          </ProfileHoverCard>
          {author?.isCertified && <CertifiedBadge />}
          {publicHandle && (
            <ProfileHoverCard user={author} username={publicHandle}>
              <span className="truncate text-[11px] text-muted-foreground transition-colors hover:text-brand">
                @{publicHandle}
              </span>
            </ProfileHoverCard>
          )}
        </div>
      </div>

      {content && (
        <div
          className={cn(
            'leading-relaxed text-foreground/90',
            nested ? 'text-[11.5px]' : 'text-xs',
            depth === 0 ? 'line-clamp-3' : depth === 1 ? 'line-clamp-2' : 'line-clamp-1'
          )}
        >
          <TextParser content={post.content} />
        </div>
      )}

      {images.length === 1 && (
        <div
          data-quoted-media
          className={cn(
            'relative mt-1.5 aspect-video overflow-hidden rounded-lg border border-border/30 bg-muted/30',
            nested ? 'max-h-28' : 'max-h-48'
          )}
        >
          <SafeImage
            src={images[0].url}
            alt={images[0].altText}
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="object-cover"
          />
        </div>
      )}

      {images.length > 1 && (
        <div
          data-quoted-media
          className={cn(
            'mt-1.5 grid grid-cols-2 gap-1 overflow-hidden rounded-lg',
            nested ? 'max-h-28' : 'max-h-48'
          )}
        >
          {images.slice(0, 4).map((img, idx) => (
            <div
              key={`${img.url}-${idx}`}
              className="relative aspect-video overflow-hidden rounded-md border border-border/30 bg-muted/30"
            >
              <SafeImage
                src={img.url}
                alt={img.altText}
                fill
                sizes="(max-width: 640px) 50vw, 240px"
                className="object-cover"
              />
              {idx === 3 && images.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/65 font-mono type-control-xs font-semibold text-background">
                  +{images.length - 4}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {isMissing && (
        <p
          data-quote-missing
          className="flex items-center gap-1.5 text-[11px] italic leading-relaxed text-muted-foreground"
        >
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
          {t`Le texte cité n’est plus disponible.`}
        </p>
      )}

      {(article || citation) && (
        <QuotedArticleCard
          article={article}
          citation={citation ?? undefined}
          quotedExcerpt={post.quotedExcerpt ?? undefined}
          compact={nested}
        />
      )}

      {innerThought && depth < MAX_QUOTE_DEPTH && (
        <QuotedThoughtCard post={innerThought} onOpenPost={onOpenPost} depth={depth + 1} />
      )}

      {innerThought && depth >= MAX_QUOTE_DEPTH && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
          {t`La chaîne de citations continue.`}
        </p>
      )}
    </div>
  );
}
