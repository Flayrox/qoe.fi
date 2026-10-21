'use client';

// =====================================================================
// ArticleEngagementBar.tsx — Barre d'Engagement Sociale & Interactions
// =====================================================================
// Fournit les contrôles d'engagement et de circulation pour les publications :
// - Bouton J'aime (Cœur) avec compteur interactif optimiste
// - Bouton Commentaires (Bulle) avec navigation directe vers #comments
// - Bouton Republier / Repost avec compteur
// - Bouton Partager avec copie dans le presse-papier & API native Web Share
// =====================================================================

import React, { useState, useCallback } from 'react';
import { Heart, MessageSquare, Repeat, Share2, Check } from 'lucide-react';
import { cn } from '@qoe/utils';

export interface ArticleEngagementBarProps {
  articleId?: string;
  articleSlug?: string;
  initialLikes?: number;
  initialComments?: number;
  initialReposts?: number;
  initialIsLiked?: boolean;
  initialIsReposted?: boolean;
  onLikeToggle?: (isLiked: boolean) => void;
  onRepostToggle?: (isReposted: boolean) => void;
  onCommentClick?: () => void;
  onShareClick?: () => void;
  size?: 'sm' | 'md';
  showShareText?: boolean;
  className?: string;
}

export function ArticleEngagementBar({
  articleSlug,
  initialLikes = 0,
  initialComments = 0,
  initialReposts = 0,
  initialIsLiked = false,
  initialIsReposted = false,
  onLikeToggle,
  onRepostToggle,
  onCommentClick,
  onShareClick,
  size = 'md',
  showShareText = true,
  className,
}: ArticleEngagementBarProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [reposts, setReposts] = useState(initialReposts);
  const [isReposted, setIsReposted] = useState(initialIsReposted);
  const [copied, setCopied] = useState(false);

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const nextLiked = !isLiked;
      setIsLiked(nextLiked);
      setLikes((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));
      onLikeToggle?.(nextLiked);
    },
    [isLiked, onLikeToggle]
  );

  const handleRepost = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const nextReposted = !isReposted;
      setIsReposted(nextReposted);
      setReposts((prev) => (nextReposted ? prev + 1 : Math.max(0, prev - 1)));
      onRepostToggle?.(nextReposted);
    },
    [isReposted, onRepostToggle]
  );

  const handleComment = useCallback(
    (e: React.MouseEvent) => {
      if (onCommentClick) {
        e.preventDefault();
        e.stopPropagation();
        onCommentClick();
        return;
      }
      const el = document.getElementById('comments');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollIntoView({ behavior: 'smooth' });
      } else if (articleSlug) {
        // Redirection vers l'ancre #comments de l'article
        window.location.href = `/article/${articleSlug}#comments`;
      }
    },
    [onCommentClick, articleSlug]
  );

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onShareClick) {
        onShareClick();
        return;
      }

      const url =
        typeof window !== 'undefined'
          ? articleSlug
            ? `${window.location.origin}/article/${articleSlug}`
            : window.location.href
          : '';

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: document.title,
            url,
          });
          return;
        } catch {
          // Annulé par l'utilisateur
        }
      }

      if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('Erreur copie presse-papier:', err);
        }
      }
    },
    [onShareClick, articleSlug]
  );

  const isSmall = size === 'sm';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 select-none text-muted-foreground',
        isSmall ? 'text-xs' : 'text-[13px] py-1.5 border-y border-border/40',
        className
      )}
    >
      {/* Groupe gauche : J'aime, Commentaires, Republier */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Like */}
        <button
          type="button"
          onClick={handleLike}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all cursor-pointer border border-transparent font-medium',
            isLiked
              ? 'text-destructive bg-destructive/10 border-destructive/20'
              : 'hover:text-foreground hover:bg-muted/60'
          )}
          title={isLiked ? "Je n'aime plus" : "J'aime cet écrit"}
          aria-label={isLiked ? "Je n'aime plus" : "J'aime"}
        >
          <Heart
            className={cn(
              isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4',
              isLiked ? 'fill-destructive text-destructive scale-105' : 'transition-transform'
            )}
          />
          {likes > 0 && <span className="font-mono text-[11px] sm:text-xs">{likes}</span>}
        </button>

        {/* Commentaires */}
        <button
          type="button"
          onClick={handleComment}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer font-medium border border-transparent"
          title="Voir et rédiger un commentaire"
          aria-label="Commentaires"
        >
          <MessageSquare className={isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          {initialComments > 0 && (
            <span className="font-mono text-[11px] sm:text-xs">{initialComments}</span>
          )}
        </button>

        {/* Republier */}
        <button
          type="button"
          onClick={handleRepost}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all cursor-pointer border border-transparent font-medium',
            isReposted
              ? 'text-primary bg-primary/10 border-primary/20'
              : 'hover:text-foreground hover:bg-muted/60'
          )}
          title={isReposted ? 'Retirer la republication' : 'Republier cet écrit'}
          aria-label="Republier"
        >
          <Repeat
            className={cn(isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4', isReposted ? 'text-primary' : '')}
          />
          {reposts > 0 && <span className="font-mono text-[11px] sm:text-xs">{reposts}</span>}
        </button>
      </div>

      {/* Groupe droit : Bouton Partager */}
      <div>
        <button
          type="button"
          onClick={handleShare}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full font-medium transition-all cursor-pointer border',
            isSmall
              ? 'px-2 py-0.5 text-[11px] hover:text-foreground hover:bg-muted/60 border-transparent'
              : 'px-3 py-1 text-xs border-border/50 hover:border-foreground/40 hover:text-foreground bg-background hover:bg-muted/30 shadow-2xs'
          )}
          title="Partager cet article"
          aria-label="Partager"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-primary" />
              <span>Copié !</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              {showShareText && <span>Partager</span>}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
