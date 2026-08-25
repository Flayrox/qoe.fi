'use client';

import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { createClient } from '@qoe/supabase/client';
import {
  TextHighlighter,
  type AnnotationItem,
  type AnnotationActionCallbacks,
} from '@qoe/ui/annotations';
import {
  getArticleHighlightsAction,
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  toggleHighlightPrivacyAction,
  deleteHighlightAction,
} from '@qoe/sdk';
import { SimilarArticlesSection } from './SimilarArticlesSection';
import { useArticleReadingTracker } from '@qoe/analytics';

export interface ArticleAnnotatorViewProps {
  article: {
    id: string;
    title: string;
    slug: string;
    content: string;
    readingTime?: number;
    createdAt: string | Date;
    isPremium?: boolean;
    accessGranted?: boolean;
    author: {
      id: string;
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
      subdomain?: string | null;
      customDomain?: string | null;
    };
    publication?: {
      subdomain?: string | null;
      customDomain?: string | null;
    } | null;
    isLoading?: boolean;
  };
  onClose?: () => void;
  initialSource?: 'feed' | 'subdomain' | 'public_profile' | 'direct';
}

interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
}

export function ArticleAnnotatorView({ article, initialSource }: ArticleAnnotatorViewProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [highlightsList, setHighlightsList] = useState<AnnotationItem[]>([]);

  // 📊 High-precision reading tracker (Dwell time actif + Scroll depth + Détection Survol)
  useArticleReadingTracker({
    articleId: article.id,
    slug: article.slug,
    readingTimeMinutes: article.readingTime || 5,
    initialSource,
  });

  // Fetch current user auth state
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
      }
    });
  }, []);

  // Fetch article highlights
  useEffect(() => {
    async function loadHighlights() {
      try {
        const res = await getArticleHighlightsAction({ articleId: article.id });
        if (res.ok && res.data?.highlights) {
          setHighlightsList(res.data.highlights);
        }
      } catch (err) {
        console.error('Error loading highlights:', err);
      }
    }
    loadHighlights();
  }, [article.id]);

  // Decoupled Annotation Action Callbacks bound to API client actions
  const callbacks: AnnotationActionCallbacks = {
    onHighlightCreate: async ({ articleId, text, note, isPublic, quoteOrdinal }) => {
      const res = await createHighlightAction({
        articleId: articleId || article.id,
        text,
        note: note || null,
        isPublic: !!isPublic,
        ...(quoteOrdinal !== undefined ? { quoteOrdinal } : {}),
      });
      if (res.ok && res.data?.highlight) {
        return { ok: true, data: res.data.highlight };
      }
      return res.ok ? { ok: false } : res;
    },
    onUpvote: async (highlightId) => {
      const res = await upvoteHighlightAction({ highlightId });
      return res;
    },
    onComment: async ({ highlightId, content }) => {
      const res = await createAnnotationCommentAction({ highlightId, content });
      if (res.ok && res.data?.comment) {
        return { ok: true, data: res.data.comment };
      }
      return res.ok ? { ok: false } : res;
    },
    onTogglePrivacy: async ({ highlightId, isPublic }) => {
      const res = await toggleHighlightPrivacyAction({ highlightId, isPublic });
      if (res.ok && res.data?.highlight) {
        return { ok: true, data: res.data.highlight };
      }
      return res.ok ? { ok: false } : res;
    },
    onDelete: async (highlightId) => {
      const res = await deleteHighlightAction({ highlightId });
      if (res.ok) {
        return { ok: true };
      }
      return res;
    },
    onCrosspost: async ({ text, commentary }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('open-composer', {
            detail: {
              quotedArticle: {
                id: article.id,
                title: article.title,
                slug: article.slug,
                content: article.content,
                author: {
                  ...article.author,
                  subdomain: article.author.subdomain || article.publication?.subdomain,
                  customDomain: article.author.customDomain || article.publication?.customDomain,
                },
              },
              quotedExcerpt: text,
              initialText: commentary || '',
            },
          })
        );
      }
      return { ok: true };
    },
  };

  const initialHighlights = highlightsList.filter((h) => !h.isPublic && !h.isOfficial);
  const publicHighlights = highlightsList.filter((h) => h.isPublic || h.isOfficial);

  const currentUserProfile = user
    ? {
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
        username: user.user_metadata?.username || null,
        logoUrl: user.user_metadata?.avatar_url || null,
      }
    : null;

  if (article.isLoading || !article.content) {
    return (
      <div className="relative w-full bg-background text-foreground space-y-6 max-w-4xl mx-auto font-sans pb-12 animate-pulse">
        <div className="space-y-3 border-b border-border/40 pb-5">
          <div className="h-8 bg-muted rounded-xl w-3/4" />
          <div className="h-4 bg-muted rounded-lg w-1/3" />
        </div>
        <div className="space-y-4 pt-4">
          <div className="h-4 bg-muted/80 rounded-lg w-full" />
          <div className="h-4 bg-muted/80 rounded-lg w-11/12" />
          <div className="h-4 bg-muted/80 rounded-lg w-4/5" />
          <div className="h-4 bg-muted/80 rounded-lg w-full" />
          <div className="h-4 bg-muted/80 rounded-lg w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-background text-foreground space-y-6 max-w-4xl mx-auto font-sans pb-12">
      {/* Article Header */}
      <div className="space-y-3 border-b border-border/40 pb-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {article.title}
        </h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Par{' '}
            <strong className="text-foreground">
              {article.author?.name || article.author?.username || 'Auteur'}
            </strong>
          </span>
          <span>•</span>
          <span>{article.readingTime || 5} min de lecture</span>
          <span>•</span>
          <time
            dateTime={
              article.createdAt
                ? typeof article.createdAt === 'string'
                  ? article.createdAt
                  : article.createdAt instanceof Date
                    ? article.createdAt.toISOString()
                    : String(article.createdAt)
                : new Date().toISOString()
            }
          >
            {new Date(article.createdAt || Date.now()).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </div>
      </div>

      {/* Shared Genius Text Selection Highlighter Engine */}
      <TextHighlighter
        articleId={article.id}
        creatorName={article.author?.name || article.author?.username || "L'Auteur"}
        allowPublicAnnotations={true}
        isAuthenticated={!!user}
        initialHighlights={initialHighlights}
        publicHighlights={publicHighlights}
        currentUserId={user?.id || null}
        currentUserProfile={currentUserProfile}
        articleAuthorId={article.author?.id || ''}
        mainAppUrl=""
        containerId="article-content"
        callbacks={callbacks}
      />

      {/* Article Body HTML */}
      <div
        id="article-content"
        className="prose prose-sm sm:prose-base dark:prose-invert max-w-none leading-relaxed text-foreground/90 selection:bg-highlight/30 cursor-text space-y-4 pt-2"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />

      {/* 🧠 À lire aussi — recommandations sémantiques (pgvector) */}
      <SimilarArticlesSection articleId={article.id} />

      {/* Paywall Cut Overlay for Premium Articles */}
      {article.isPremium && article.accessGranted === false && (
        <div className="relative mt-8 p-6 sm:p-8 rounded-2xl bg-card border border-highlight/30 shadow-xl text-center space-y-4 not-prose">
          <div className="w-12 h-12 rounded-full bg-highlight/10 text-highlight flex items-center justify-center mx-auto shadow-sm">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-foreground tracking-tight">
            Écrit réservé aux membres Premium
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            La suite de cette publication est exclusivement réservée aux abonnés de{' '}
            <strong className="text-foreground">
              {article.author.name || article.author.username}
            </strong>
            .
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={
                article.author.subdomain
                  ? `https://${article.author.subdomain}.qoe.fi/article/${article.slug}`
                  : `/article/${article.slug}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-highlight text-black font-bold text-xs sm:text-sm hover:bg-highlight/90 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              S'abonner pour débloquer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
