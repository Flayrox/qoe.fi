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

import React, { useState, useCallback, useRef, useEffect, useContext } from 'react';
import { Heart, MessageSquare, Repeat, Share2, Check, Link2, Mail, Quote } from 'lucide-react';
import { cn } from '@qoe/utils';
import { toggleLikePostAction, toggleRepostPostAction } from '@qoe/sdk/actions/feed';
import { t } from '@lingui/core/macro';
import { AuthModalContext } from '../../auth/AuthModalContext';

export interface ArticleEngagementBarProps {
  articleId?: string;
  articleSlug?: string;
  articleTitle?: string;
  initialLikes?: number;
  initialComments?: number;
  initialReposts?: number;
  initialIsLiked?: boolean;
  initialIsReposted?: boolean;
  onLikeToggle?: (isLiked: boolean) => void;
  onRepostToggle?: (isReposted: boolean) => void;
  onCommentClick?: () => void;
  onShareClick?: () => void;
  onQuoteClick?: () => void;
  size?: 'sm' | 'md';
  showShareText?: boolean;
  className?: string;
  layout?: 'spread' | 'center';
  revealOnHover?: boolean;
}

function BlueskyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 568 501" fill="currentColor" aria-hidden="true">
      <path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.25 122.39-166.026-30.69-189.333-72.37-23.307 41.68-70.083 194.76-189.333 72.37-63.111-64.76-33.889-129.52 80.986-149.07-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.135-1.612 123.121 33.664Z" />
    </svg>
  );
}

function XTwitterIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkedinIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.75-1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

export function ArticleEngagementBar({
  articleId,
  articleSlug,
  articleTitle,
  initialLikes = 0,
  initialComments = 0,
  initialReposts = 0,
  initialIsLiked = false,
  initialIsReposted = false,
  onLikeToggle,
  onRepostToggle,
  onCommentClick,
  onShareClick,
  onQuoteClick,
  size = 'md',
  showShareText = true,
  className,
  layout = 'spread',
  revealOnHover = false,
}: ArticleEngagementBarProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [reposts, setReposts] = useState(initialReposts);
  const [isReposted, setIsReposted] = useState(initialIsReposted);
  const [comments, setComments] = useState(initialComments);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isRepostOpen, setIsRepostOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const repostContainerRef = useRef<HTMLDivElement>(null);
  const authContext = useContext(AuthModalContext);

  // Synchronisation si les props d'initialisation changent
  useEffect(() => {
    setLikes(initialLikes);
  }, [initialLikes]);

  useEffect(() => {
    setIsLiked(initialIsLiked);
  }, [initialIsLiked]);

  useEffect(() => {
    setReposts(initialReposts);
  }, [initialReposts]);

  useEffect(() => {
    setIsReposted(initialIsReposted);
  }, [initialIsReposted]);

  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  // Fermeture des menus au clic extérieur ou touche Échap
  useEffect(() => {
    if (!isShareOpen && !isRepostOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (shareContainerRef.current && !shareContainerRef.current.contains(target)) {
        setIsShareOpen(false);
      }
      if (repostContainerRef.current && !repostContainerRef.current.contains(target)) {
        setIsRepostOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsShareOpen(false);
        setIsRepostOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isShareOpen, isRepostOpen]);

  const resolveShareUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, [articleSlug]);

  const handleLike = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const nextLiked = !isLiked;
      setIsLiked(nextLiked);
      setLikes((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

      if (onLikeToggle) {
        onLikeToggle(nextLiked);
        return;
      }

      if (articleId) {
        try {
          const res = await toggleLikePostAction(articleId);
          if (res?.ok) {
            setIsLiked(Boolean(res.data?.liked));
          } else {
            // Revert optimiste si échec ou non authentifié
            setIsLiked(!nextLiked);
            setLikes((prev) => (nextLiked ? Math.max(0, prev - 1) : prev + 1));
            if (res?.error?.code === 'UNAUTHORIZED' && authContext?.openAuthModal) {
              authContext.openAuthModal({ mode: 'login', actionContext: 'like' });
            }
          }
        } catch {
          setIsLiked(!nextLiked);
          setLikes((prev) => (nextLiked ? Math.max(0, prev - 1) : prev + 1));
        }
      }
    },
    [isLiked, onLikeToggle, articleId, authContext]
  );

  // Déclenchement du menu popover de republication (Republier vs Citer)
  const handleRepostButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRepostOpen((prev) => !prev);
    setIsShareOpen(false);
  }, []);

  // Action 1 : Republication directe sur le profil
  const handleDirectRepost = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsRepostOpen(false);
      const nextReposted = !isReposted;
      setIsReposted(nextReposted);
      setReposts((prev) => (nextReposted ? prev + 1 : Math.max(0, prev - 1)));

      if (onRepostToggle) {
        onRepostToggle(nextReposted);
        return;
      }

      if (articleId) {
        try {
          const res = await toggleRepostPostAction(articleId);
          if (res?.ok) {
            setIsReposted(Boolean(res.data?.reposted));
          } else {
            // Revert optimiste si échec ou non authentifié
            setIsReposted(!nextReposted);
            setReposts((prev) => (nextReposted ? Math.max(0, prev - 1) : prev + 1));
            if (res?.error?.code === 'UNAUTHORIZED' && authContext?.openAuthModal) {
              authContext.openAuthModal({ mode: 'login', actionContext: 'repost' });
            }
          }
        } catch {
          setIsReposted(!nextReposted);
          setReposts((prev) => (nextReposted ? Math.max(0, prev - 1) : prev + 1));
        }
      }
    },
    [isReposted, onRepostToggle, articleId, authContext]
  );

  // Action 2 : Citation de l'article avec une réflexion / note
  const handleQuoteRepost = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsRepostOpen(false);

      if (onQuoteClick) {
        onQuoteClick();
        return;
      }

      // Redirection native vers le composer de pensées de Qoefi avec l'article en citation
      if (typeof window !== 'undefined') {
        const target = articleSlug || articleId || '';
        window.location.href = `/home?compose=true&quoteArticle=${encodeURIComponent(target)}`;
      }
    },
    [onQuoteClick, articleSlug, articleId]
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
      } else {
        window.location.href = `${window.location.pathname}#comments`;
      }
    },
    [onCommentClick, articleSlug]
  );

  const handleCopyLink = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = resolveShareUrl();
      if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            setIsShareOpen(false);
          }, 1200);
        } catch (err) {
          console.error('Erreur copie presse-papier:', err);
        }
      }
    },
    [resolveShareUrl]
  );

  const handleEmailShare = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = resolveShareUrl();
      const subject = encodeURIComponent(articleTitle || t`À lire absolument`);
      const body = encodeURIComponent(
        `${t`Je te recommande la lecture de cet article :`}\n\n${url}`
      );
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      setIsShareOpen(false);
    },
    [resolveShareUrl, articleTitle]
  );

  const handleSocialShare = useCallback(
    (platform: 'x' | 'bluesky' | 'linkedin' | 'facebook') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = resolveShareUrl();
      const title = articleTitle || '';
      let targetUrl = '';

      switch (platform) {
        case 'x':
          targetUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
          break;
        case 'bluesky':
          targetUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`.trim())}`;
          break;
        case 'linkedin':
          targetUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
          break;
        case 'facebook':
          targetUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
          break;
      }

      if (targetUrl && typeof window !== 'undefined') {
        window.open(targetUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
        setIsShareOpen(false);
      }
    },
    [resolveShareUrl, articleTitle]
  );

  const isSmall = size === 'sm';
  const isCenter = layout === 'center';

  const renderCount = (count: number) => {
    if (count <= 0) return null;
    return (
      <span
        className={cn(
          'font-medium text-xs',
          revealOnHover &&
            'opacity-0 group-hover/btn:opacity-100 group-hover/bar:opacity-100 max-w-0 group-hover/btn:max-w-xs group-hover/bar:max-w-xs overflow-hidden transition-all duration-200'
        )}
      >
        {count}
      </span>
    );
  };

  const isAnyMenuOpen = isShareOpen || isRepostOpen;

  const interactiveClass =
    revealOnHover && !isAnyMenuOpen
      ? 'pointer-events-auto sm:pointer-events-none sm:group-hover/bar:pointer-events-auto sm:cursor-default sm:group-hover/bar:cursor-pointer'
      : 'cursor-pointer';

  const actionButtons = (
    <>
      {/* Like */}
      <button
        type="button"
        onClick={handleLike}
        className={cn(
          'group/btn flex items-center gap-1.5 rounded-full px-2 py-1 transition-all border border-transparent font-medium',
          interactiveClass,
          isLiked
            ? 'text-destructive bg-destructive/10 border-destructive/20'
            : 'hover:text-foreground hover:bg-muted/60'
        )}
        title={isLiked ? t`Je n'aime plus` : t`J'aime cet écrit`}
        aria-label={isLiked ? t`Je n'aime plus` : t`J'aime`}
      >
        <Heart
          className={cn(
            isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4',
            isLiked ? 'fill-destructive text-destructive scale-105' : 'transition-transform'
          )}
        />
        {renderCount(likes)}
      </button>

      {/* Commentaires */}
      <button
        type="button"
        onClick={handleComment}
        className={cn(
          'group/btn flex items-center gap-1.5 rounded-full px-2 py-1 hover:text-foreground hover:bg-muted/60 transition-all font-medium border border-transparent',
          interactiveClass
        )}
        title={t`Voir et rédiger un commentaire`}
        aria-label={t`Commentaires`}
      >
        <MessageSquare className={isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {renderCount(comments)}
      </button>

      {/* Republier avec Popover (Republier sur mon profil vs Citer la publication) */}
      <div className="relative group/btn" ref={repostContainerRef}>
        <button
          type="button"
          onClick={handleRepostButtonClick}
          className={cn(
            'group/btn flex items-center gap-1.5 rounded-full px-2 py-1 transition-all border font-medium',
            interactiveClass,
            isReposted
              ? 'text-primary bg-primary/10 border-primary/20'
              : 'hover:text-foreground hover:bg-muted/60 border-transparent',
            isRepostOpen && 'bg-muted/50 text-foreground border-foreground/30'
          )}
          title={
            isReposted ? t`Retirer la republication ou citer` : t`Republier ou citer cet écrit`
          }
          aria-label={t`Republier`}
          aria-expanded={isRepostOpen}
        >
          <Repeat
            className={cn(isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4', isReposted ? 'text-primary' : '')}
          />
          {renderCount(reposts)}
        </button>

        {/* Menu Popover de Republication (choix entre repost direct et citation) */}
        {isRepostOpen && (
          <div className="absolute left-0 top-full mt-2 w-56 rounded-[4px] bg-card/95 backdrop-blur-xl border border-border/60 shadow-xl p-1.5 z-50 flex flex-col text-sm animate-in fade-in-0 zoom-in-95 font-sans">
            {/* 1. Republier directement */}
            <button
              type="button"
              onClick={handleDirectRepost}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
            >
              <Repeat
                className={cn('w-4 h-4 shrink-0', isReposted ? 'text-destructive' : 'text-primary')}
              />
              <div className="flex flex-col">
                <span>
                  {isReposted ? t`Annuler la republication` : t`Republier sur mon profil`}
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {isReposted ? t`Retirer du fil` : t`Partage direct dans le fil`}
                </span>
              </div>
            </button>

            {/* 2. Citer la publication */}
            <button
              type="button"
              onClick={handleQuoteRepost}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
            >
              <Quote className="w-4 h-4 text-primary shrink-0" />
              <div className="flex flex-col">
                <span>{t`Citer la publication`}</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {t`Ajouter une note ou réflexion`}
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  );

  const shareButton = (
    <div className="relative group/btn" ref={shareContainerRef}>
      <button
        type="button"
        onClick={() => {
          if (onShareClick) {
            onShareClick();
            return;
          }
          setIsShareOpen((prev) => !prev);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full font-medium transition-all border',
          interactiveClass,
          isSmall || !showShareText
            ? 'px-2 py-1 text-[11px] hover:text-foreground hover:bg-muted/60 border-transparent'
            : 'px-3 py-1 text-xs border-border/50 hover:border-foreground/40 hover:text-foreground bg-background hover:bg-muted/30 shadow-2xs',
          isShareOpen && 'bg-muted/50 text-foreground border-foreground/30'
        )}
        title={t`Partager cet article`}
        aria-label={t`Partager`}
        aria-expanded={isShareOpen}
      >
        <Share2 className={isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {showShareText && <span>{t`Partager`}</span>}
      </button>

      {/* Popover Menu Déroulant de Partage */}
      {isShareOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-[4px] bg-card/95 backdrop-blur-xl border border-border/60 shadow-xl p-1.5 z-50 flex flex-col text-sm animate-in fade-in-0 zoom-in-95">
          {/* Copier le lien */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-primary shrink-0" />
                <span className="text-primary font-semibold">{t`Lien copié !`}</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{t`Copier le lien`}</span>
              </>
            )}
          </button>

          {/* Envoyer par e-mail */}
          <button
            type="button"
            onClick={handleEmailShare}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t`Envoyer par e-mail`}</span>
          </button>

          {/* Séparateur */}
          <div className="h-px bg-border/40 my-1 mx-2" />

          {/* Partager sur Facebook */}
          <button
            type="button"
            onClick={handleSocialShare('facebook')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            <FacebookIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t`Partager sur Facebook`}</span>
          </button>

          {/* Partager sur LinkedIn */}
          <button
            type="button"
            onClick={handleSocialShare('linkedin')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            <LinkedinIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t`Partager sur LinkedIn`}</span>
          </button>

          {/* Partager sur X */}
          <button
            type="button"
            onClick={handleSocialShare('x')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            <XTwitterIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t`Partager sur X`}</span>
          </button>

          {/* Partager sur Bluesky */}
          <button
            type="button"
            onClick={handleSocialShare('bluesky')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/80 rounded-[3px] transition-colors cursor-pointer text-left"
          >
            <BlueskyIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{t`Partager sur Bluesky`}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'select-none text-muted-foreground group/bar pointer-events-auto',
        revealOnHover &&
          !isAnyMenuOpen &&
          'opacity-70 sm:opacity-50 group-hover:opacity-90 group-hover/bar:opacity-100 transition-opacity',
        isCenter
          ? 'flex items-center justify-center gap-3 sm:gap-5'
          : 'flex items-center justify-between gap-3',
        isSmall ? 'text-xs' : 'text-[13px] py-1.5 border-y border-border/40',
        className
      )}
    >
      {isCenter ? (
        <>
          {actionButtons}
          {shareButton}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 sm:gap-2">{actionButtons}</div>
          {shareButton}
        </>
      )}
    </div>
  );
}
