"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@qoe/supabase/client";
import {
  TextHighlighter,
  AnnotationSideDrawer,
  TextSelectionPopover,
  type AnnotationItem,
  type AnnotationActionCallbacks,
} from "@qoe/ui/annotations";
import {
  getArticleHighlightsAction,
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  toggleHighlightPrivacyAction,
  deleteHighlightAction,
  quotePassageToFeedAction,
} from "@qoe/api-client";

export interface ArticleAnnotatorViewProps {
  article: {
    id: string;
    title: string;
    slug: string;
    content: string;
    readingTime?: number;
    createdAt: string | Date;
    author: {
      id: string;
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
      subdomain?: string | null;
      customDomain?: string | null;
    };
  };
  onClose?: () => void;
}

export function ArticleAnnotatorView({ article, onClose }: ArticleAnnotatorViewProps) {
  const [user, setUser] = useState<any>(null);
  const [highlightsList, setHighlightsList] = useState<any[]>([]);
  const [isLoadingHighlights, setIsLoadingHighlights] = useState(true);

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
        console.error("Error loading highlights:", err);
      } finally {
        setIsLoadingHighlights(false);
      }
    }
    loadHighlights();
  }, [article.id]);

  // Decoupled Annotation Action Callbacks bound to API client actions
  const callbacks: AnnotationActionCallbacks = {
    onHighlightCreate: async ({ articleId, text, note, isPublic }) => {
      const res = await createHighlightAction({
        articleId: articleId || article.id,
        text,
        note: note || null,
        isPublic: !!isPublic,
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
    onCrosspost: async ({ articleId, text, commentary }) => {
      const res = await quotePassageToFeedAction({
        articleId: articleId || article.id,
        text,
        commentary,
      });
      if (res.ok) {
        return { ok: true, data: res.data };
      }
      return res;
    },
  };

  const initialHighlights = highlightsList.filter((h) => !h.isPublic && !h.isOfficial);
  const publicHighlights = highlightsList.filter((h) => h.isPublic || h.isOfficial);

  const currentUserProfile = user
    ? {
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split("@")[0] || null,
        username: user.user_metadata?.username || null,
        logoUrl: user.user_metadata?.avatar_url || null,
      }
    : null;

  return (
    <div className="relative w-full bg-background text-foreground space-y-6 max-w-4xl mx-auto font-sans pb-12">
      {/* Article Header */}
      <div className="space-y-3 border-b border-border/40 pb-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {article.title}
        </h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Par <strong className="text-foreground">{article.author.name || article.author.username || "Auteur"}</strong>
          </span>
          <span>•</span>
          <span>{article.readingTime || 5} min de lecture</span>
          <span>•</span>
          <time
            dateTime={
              typeof article.createdAt === "string"
                ? article.createdAt
                : article.createdAt.toISOString()
            }
          >
            {new Date(article.createdAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>
      </div>

      {/* Shared Genius Text Selection Highlighter Engine */}
      <TextHighlighter
        articleId={article.id}
        creatorName={article.author.name || article.author.username || "L'Auteur"}
        allowPublicAnnotations={true}
        isAuthenticated={!!user}
        initialHighlights={initialHighlights}
        publicHighlights={publicHighlights}
        currentUserId={user?.id || null}
        currentUserProfile={currentUserProfile}
        articleAuthorId={article.author.id}
        mainAppUrl=""
        containerId="article-content"
        callbacks={callbacks}
      />

      {/* Article Body HTML */}
      <div
        id="article-content"
        className="prose prose-sm sm:prose-base dark:prose-invert max-w-none leading-relaxed text-foreground/90 selection:bg-amber-500/30 cursor-text space-y-4 pt-2"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </div>
  );
}
