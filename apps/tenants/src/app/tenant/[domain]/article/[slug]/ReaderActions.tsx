'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  UserPlus,
  UserCheck,
  BookmarkCheck,
  HelpCircle,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { toggleFollowCreatorAction, toggleBookmarkArticleAction } from '@qoe/sdk/actions/tenant';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@qoe/utils';
import { useRequireAuth } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@qoe/ui/ui/dropdown-menu';
import { ReadingSettingsSheet, TextToSpeechPlayer } from '@qoe/ui/reader';
import { t } from '@lingui/core/macro';

interface ReaderActionsProps {
  articleId: string;
  publicationId: string;
  creatorName: string;
  author?: {
    id: string;
    name: string;
    username?: string | null;
  } | null;
  isAuthenticated: boolean;
  initialBookmarked: boolean;
  initialFollowed: boolean;
  mainAppUrl: string;
  articleTitle?: string;
}

/**
 * La barre d'actions de lecture d'un tenant — le « pop » en bas d'écran.
 *
 * 🎯 Trois corrections :
 *    1. **Les boutons sont ceux du contrat.** La suivre était peinte avec
 *       `#EE4B2B` en dur : la barre ne suivait ni le thème ni l'accent de la
 *       publication, et le jour où le vermillon change, un écran reste
 *       rouge. Elle lit maintenant `tone="brand"`.
 *    2. **Les icônes ont un nom.** Les trois boutons-icônes ne portaient
 *       qu'un `title` : invisible au toucher, ignoré par la plupart des
 *       lecteurs d'écran. Ils ont un `aria-label`, et les deux bascules
 *       exposent `aria-pressed`.
 *    3. **Le mouvement et l'encoche.** L'entrée animée respecte
 *       `prefers-reduced-motion`, et la barre remonte au-dessus de la barre
 *       de geste des iPhone (`env(safe-area-inset-bottom)`).
 */
export function ReaderActions({
  articleId,
  publicationId,
  creatorName,
  author,
  isAuthenticated,
  initialBookmarked,
  initialFollowed,
  articleTitle,
}: ReaderActionsProps) {
  const { openAuthModal } = useRequireAuth();
  const reduceMotion = useReducedMotion();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [followed, setFollowed] = useState(initialFollowed);
  const [authorFollowed, setAuthorFollowed] = useState(false);
  const [loadingBookmark, setLoadingBookmark] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [loadingAuthorFollow, setLoadingAuthorFollow] = useState(false);

  const handleBookmark = async () => {
    if (!isAuthenticated) {
      openAuthModal({ mode: 'signup', actionContext: 'bookmark' });
      return;
    }
    setLoadingBookmark(true);
    try {
      const res = await toggleBookmarkArticleAction(articleId);
      if (res.ok) {
        setBookmarked(!!res.data.bookmarked);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBookmark(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      openAuthModal({ mode: 'signup', actionContext: 'follow' });
      return;
    }
    setLoadingFollow(true);
    try {
      const res = await toggleFollowCreatorAction(publicationId);
      if (res.ok) {
        setFollowed(!!res.data.followed);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleAuthorFollow = async () => {
    if (!isAuthenticated) {
      openAuthModal({ mode: 'signup', actionContext: 'follow' });
      return;
    }
    if (!author?.id) return;
    setLoadingAuthorFollow(true);
    try {
      const res = await toggleFollowCreatorAction(author.id);
      if (res.ok) {
        setAuthorFollowed(!!res.data.followed);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAuthorFollow(false);
    }
  };

  const hasAuthorOption = Boolean(
    author?.name && author.name.trim().toLowerCase() !== creatorName.trim().toLowerCase()
  );

  const scrollToComments = () => {
    const el = document.getElementById('comments');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.div
      role="group"
      aria-label={t`Actions de lecture`}
      initial={reduceMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }
      }
      className="pointer-events-auto fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 flex max-w-[95%] -translate-x-1/2 items-center gap-1 rounded-panel border border-border/80 bg-card/90 p-1.5 font-sans shadow-xl backdrop-blur-md select-none sm:max-w-fit"
    >
      <Button
        variant="ghost"
        shape="icon"
        size="sm"
        onClick={handleBookmark}
        aria-pressed={bookmarked}
        aria-busy={loadingBookmark}
        disabled={loadingBookmark}
        title={t`Sauvegarder cet écrit`}
        aria-label={bookmarked ? t`Retirer des sauvegardes` : t`Sauvegarder cet écrit`}
        className={bookmarked ? 'text-brand-vivid-strong' : 'text-muted-foreground'}
      >
        {bookmarked ? (
          <BookmarkCheck className="size-4" strokeWidth={1.75} />
        ) : (
          <Bookmark className="size-4" strokeWidth={1.75} />
        )}
      </Button>

      <Button
        variant="ghost"
        shape="icon"
        size="sm"
        onClick={scrollToComments}
        title={t`Voir & laisser un commentaire`}
        aria-label={t`Voir les commentaires`}
        className="text-muted-foreground"
      >
        <MessageSquare className="size-4" strokeWidth={1.75} />
      </Button>

      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

      {/* Réglages de lecture « Aa » et synthèse vocale : deux composants du
          reader qui gardent leur propre peau. */}
      <ReadingSettingsSheet className="h-control-sm w-7 justify-center rounded-control border-0 bg-transparent px-0 py-0 text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground" />

      <TextToSpeechPlayer
        articleTitle={articleTitle || creatorName}
        articleContentSelector="#article-content"
        className="h-control-sm rounded-control border-0 bg-transparent px-2.5 text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground"
      />

      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

      <div className="inline-flex items-center">
        <Button
          variant={followed ? 'ghost' : 'solid'}
          tone={followed ? 'neutral' : 'brand'}
          size="sm"
          onClick={handleFollow}
          disabled={loadingFollow}
          aria-pressed={followed}
          aria-busy={loadingFollow}
          className={cn(
            followed ? 'text-muted-foreground' : undefined,
            hasAuthorOption && 'rounded-r-none'
          )}
        >
          {followed ? (
            <>
              <UserCheck className="size-3.5" strokeWidth={1.75} /> <span>{t`Abonné`}</span>
            </>
          ) : (
            <>
              <UserPlus className="size-3.5" strokeWidth={1.75} />{' '}
              <span>{t`Suivre ${creatorName}`}</span>
            </>
          )}
        </Button>

        {hasAuthorOption && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t`Options de suivi des auteurs`}
              className={cn(
                'inline-flex h-control-sm items-center justify-center rounded-r-control border-l border-white/20 px-1.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring',
                followed
                  ? 'hover:bg-muted text-muted-foreground'
                  : 'bg-brand text-brand-foreground hover:brightness-110'
              )}
            >
              <ChevronDown className="size-3.5" strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                isDisabled={loadingAuthorFollow}
                onAction={() => void handleAuthorFollow()}
              >
                {authorFollowed ? (
                  <UserCheck className="size-3.5 text-success-text" strokeWidth={1.75} />
                ) : (
                  <UserPlus className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                )}
                <span className="truncate">
                  {authorFollowed
                    ? t`Abonné à ${author!.name}`
                    : t`Suivre également ${author!.name}`}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!isAuthenticated && (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={() => openAuthModal({ mode: 'signup' })}
            title={t`Créer un compte sur qoefi`}
          >
            <span className="whitespace-nowrap">{t`S'inscrire sur qoefi`}</span>
          </Button>
        </>
      )}

      {isAuthenticated && (
        <>
          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <div className="hidden items-center gap-1 px-1 text-[10px] font-medium whitespace-nowrap text-muted-foreground sm:flex">
            <HelpCircle className="size-3 shrink-0" strokeWidth={1.75} />
            <span>{t`Surlignez du texte pour annoter`}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
