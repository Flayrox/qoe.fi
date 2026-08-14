'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  UserPlus,
  UserCheck,
  BookmarkCheck,
  HelpCircle,
  MessageSquare,
} from 'lucide-react';
import {
  toggleFollowCreatorAction,
  toggleBookmarkArticleAction,
} from '@qoe/api-client/actions/tenant';

import { cn } from '@qoe/utils';
import { motion } from 'framer-motion';
import { useRequireAuth } from '@qoe/ui';
import { t } from '@lingui/core/macro';

interface ReaderActionsProps {
  articleId: string;
  publicationId: string;
  creatorName: string;
  isAuthenticated: boolean;
  initialBookmarked: boolean;
  initialFollowed: boolean;
  mainAppUrl: string;
}

export function ReaderActions({
  articleId,
  publicationId,
  creatorName,
  isAuthenticated,
  initialBookmarked,
  initialFollowed,
}: ReaderActionsProps) {
  const { openAuthModal } = useRequireAuth();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [followed, setFollowed] = useState(initialFollowed);
  const [loadingBookmark, setLoadingBookmark] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

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

  const scrollToComments = () => {
    const el = document.getElementById('comments');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card/90 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl p-2 flex items-center gap-2 transition-all duration-300 pointer-events-auto select-none max-w-[95%] sm:max-w-fit font-sans"
    >
      {/* Bookmark Action */}
      <button
        onClick={handleBookmark}
        disabled={loadingBookmark}
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0',
          bookmarked
            ? 'bg-highlight/10 text-highlight'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
        )}
        title={t`Sauvegarder cet écrit`}
      >
        {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
      </button>

      {/* Comment Scroll Action */}
      <button
        onClick={scrollToComments}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
        title={t`Voir & laisser un commentaire`}
      >
        <MessageSquare className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-border shrink-0" />

      {/* Follow Action */}
      <button
        onClick={handleFollow}
        disabled={loadingFollow}
        className={cn(
          'px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0',
          followed
            ? 'bg-muted text-muted-foreground hover:text-foreground'
            : 'bg-[#EE4B2B] text-white hover:bg-[#d63d20] shadow-sm shadow-[#EE4B2B]/20'
        )}
      >
        {followed ? (
          <>
            <UserCheck className="w-3.5 h-3.5" /> <span>{t`Abonné`}</span>
          </>
        ) : (
          <>
            <UserPlus className="w-3.5 h-3.5" /> <span>{t`Suivre ${creatorName}`}</span>
          </>
        )}
      </button>

      {/* S'inscrire sur qoe.fi CTA when not authenticated */}
      {!isAuthenticated && (
        <>
          <div className="w-px h-4 bg-border shrink-0" />
          <button
            onClick={() => openAuthModal({ mode: 'signup' })}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center cursor-pointer shadow-sm shrink-0"
            title={t`Créer un compte sur qoe.fi`}
          >
            <span className="whitespace-nowrap">{t`S'inscrire sur qoe.fi`}</span>
          </button>
        </>
      )}

      {isAuthenticated && (
        <>
          <div className="w-px h-4 bg-border hidden sm:block shrink-0" />
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground px-1 font-medium whitespace-nowrap">
            <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />
            <span>{t`Surlignez du texte pour annoter`}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
