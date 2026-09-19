'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Bookmark, BookMarked, Check, Lock, Share2, UserCheck, UserPlus } from 'lucide-react';
import { createClient } from '@qoe/supabase/client';
import {
  TextHighlighter,
  createAnnotationCallbacks,
  type AnnotationItem,
  type AnnotationActionCallbacks,
  type CanonicalDocument,
  type SpotlightRange,
} from '@qoe/ui/annotations';
import { getCanonicalDocumentAction } from '@/lib/canonical-document';
import {
  getArticleHighlightsAction,
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  toggleHighlightPrivacyAction,
  deleteHighlightAction,
} from '@qoe/sdk';
import { toggleFollowCreatorHomeAction } from '@qoe/sdk/actions/feed';
import { SimilarArticlesSection } from './SimilarArticlesSection';
import { useArticleReadingTracker } from '@qoe/analytics';
import { SubscribeForm, SafeAvatar, ProfileHoverCard } from '@qoe/ui';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';
import {
  ReadingPreferencesProvider,
  useReadingPreferences,
  ReadingSettingsSheet,
  ReadingRuler,
  TextToSpeechPlayer,
  getReaderTypographyClasses,
  formatBionicHtml,
} from '@qoe/ui/reader';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { useReaderToolbar } from './ReaderToolbarContext';

export interface ArticleAnnotatorViewProps {
  article: {
    id: string;
    title: string;
    slug: string;
    content: string;
    imageUrl?: string | null;
    readingTime?: number;
    createdAt: string | Date;
    isPremium?: boolean;
    accessGranted?: boolean;
    author: {
      id: string;
      name?: string | null;
      username?: string | null;
      logoUrl?: string | null;
      heroText?: string | null;
      subdomain?: string | null;
      customDomain?: string | null;
      isCertified?: boolean;
      type?: 'PERSONAL' | 'MEDIA' | string | null;
      accentColor?: string | null;
    };
    category?: { name: string } | null;
    tags?: string[];
    publication?: {
      name?: string | null;
      slug?: string | null;
      subdomain?: string | null;
      logoUrl?: string | null;
      customDomain?: string | null;
      accentColor?: string | null;
    } | null;
    allowPublicAnnotations?: boolean;
    isLoading?: boolean;
  };
  onClose?: () => void;
  initialSource?: 'feed' | 'subdomain' | 'public_profile' | 'direct';
  /**
   * Document canonique (tranche 1-c) : le corps est rendu par blocs, marques
   * par offsets. Non fourni → fetch client (drawer) ; null → moteur hérité.
   */
  canonicalDocument?: CanonicalDocument | null;
  /**
   * Passage à mettre en avant à l'ouverture (deep-link citation → article,
   * tranche 6-b). Appliqué quand le document canonique est rendu, si
   * l'empreinte correspond.
   */
  spotlight?: SpotlightRange | null;
  onOpenProfile?: (username: string) => void;
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

export function ArticleAnnotatorView(props: ArticleAnnotatorViewProps) {
  return (
    <ReadingPreferencesProvider>
      <ArticleAnnotatorViewInner {...props} />
    </ReadingPreferencesProvider>
  );
}

function ArticleAnnotatorViewInner({
  article,
  initialSource,
  canonicalDocument: canonicalDocumentProp,
  spotlight,
  onOpenProfile,
}: ArticleAnnotatorViewProps) {
  const toolbar = useReaderToolbar();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [highlightsList, setHighlightsList] = useState<AnnotationItem[]>([]);
  const [clientDocument, setClientDocument] = useState<CanonicalDocument | null | undefined>(
    undefined
  );
  const [bookmarked, setBookmarked] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeBookmarked = toolbar ? toolbar.bookmarked : bookmarked;
  const activeCopied = toolbar ? toolbar.copied : copied;

  // Document canonique : la prop serveur prime (SSR peint les marques). Sans
  // prop (drawer du feed), fetch client — jamais pour un article premium
  // dont l'accès complet n'est pas confirmé (fuite du contenu payant).
  const canonicalDocument =
    canonicalDocumentProp !== undefined ? canonicalDocumentProp : clientDocument;
  const documentMode = !!canonicalDocument;

  useEffect(() => {
    if (canonicalDocumentProp !== undefined) return;
    const canFetchDocument = !article.isPremium || article.accessGranted === true;
    if (!canFetchDocument || !article.id) return;
    let cancelled = false;
    (async () => {
      const doc = await getCanonicalDocumentAction(article.id);
      if (!cancelled) setClientDocument(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [article.id, article.isPremium, article.accessGranted, canonicalDocumentProp]);

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

  // Standardized Annotation Action Callbacks bound to API client actions
  const callbacks: AnnotationActionCallbacks = React.useMemo(
    () =>
      createAnnotationCallbacks(
        article.id,
        {
          createHighlightAction,
          upvoteHighlightAction: (id) =>
            upvoteHighlightAction(typeof id === 'string' ? { highlightId: id } : id),
          createAnnotationCommentAction,
          toggleHighlightPrivacyAction,
          deleteHighlightAction: (id) =>
            deleteHighlightAction(typeof id === 'string' ? { highlightId: id } : id),
        },
        {
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
                        customDomain:
                          article.author.customDomain || article.publication?.customDomain,
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
        }
      ),
    [article]
  );

  // Sync bookmark and follow states
  useEffect(() => {
    if (!user?.id || !article.id) return;
    const supabase = createClient();
    supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('article_id', article.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBookmarked(true);
          toolbar?.setBookmarked(true);
        }
      });
    if (article.author?.id) {
      supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('creator_id', article.author.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setFollowed(true);
        });
    }
  }, [user?.id, article.id, article.author?.id, toolbar]);

  const toggleBookmark = React.useCallback(async () => {
    if (!user) return;
    const next = !activeBookmarked;
    setBookmarked(next);
    toolbar?.setBookmarked(next);
    const supabase = createClient();
    if (next) {
      await supabase.from('bookmarks').insert({ user_id: user.id, article_id: article.id });
    } else {
      await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('article_id', article.id);
    }
  }, [user, activeBookmarked, toolbar, article.id]);

  useEffect(() => {
    if (toolbar?.registerToggleBookmark) {
      toolbar.registerToggleBookmark(toggleBookmark);
    }
  }, [toolbar, toggleBookmark]);

  const toggleFollow = async () => {
    if (!user || !article.author?.id) return;
    const next = !followed;
    setFollowed(next);
    try {
      await toggleFollowCreatorHomeAction(article.author.id);
    } catch {
      setFollowed(!next);
    }
  };

  const handleShare = React.useCallback(async () => {
    if (toolbar?.handleShare) {
      toolbar.handleShare();
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    }
  }, [toolbar]);

  const initialHighlights = React.useMemo(
    () => highlightsList.filter((h) => !h.isPublic && !h.isOfficial),
    [highlightsList]
  );
  const publicHighlights = React.useMemo(
    () => highlightsList.filter((h) => h.isPublic || h.isOfficial),
    [highlightsList]
  );

  const currentUserProfile = user
    ? {
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
        username: user.user_metadata?.username || null,
        logoUrl: user.user_metadata?.avatar_url || null,
      }
    : null;

  const { preferences } = useReadingPreferences();
  const typographyClasses = getReaderTypographyClasses(preferences);

  const displayedContent = React.useMemo(() => {
    if (!article.content) return '';
    return preferences.bionicReading ? formatBionicHtml(article.content) : article.content;
  }, [article.content, preferences.bionicReading]);

  const authorName = article.author?.name || article.author?.username || 'Auteur';
  const authorHandle = article.author?.username || article.author?.subdomain || '';
  // Quand l'auteur EST le média lui-même, la ligne « Pour <média> » serait un
  // doublon : on la masque.
  const publication = article.publication;
  const publicationLabel = (publication?.name ?? '').trim().toLowerCase();
  const showPublicationLine =
    publication != null &&
    publicationLabel !== '' &&
    publicationLabel !== authorName.trim().toLowerCase();
  const dateObj = new Date(article.createdAt || Date.now());
  const dateFormatted = dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateIso = dateObj.toISOString();

  if (article.isLoading || !article.content) {
    return (
      <div className="relative w-full space-y-6 max-w-4xl mx-auto font-sans pb-12 animate-pulse bg-white dark:bg-black text-black dark:text-white">
        <div className="space-y-3 border-b border-border/30 pb-5">
          <div className="h-10 bg-muted rounded-xl w-3/4" />
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
    <div
      className={cn(
        'relative w-full space-y-6 max-w-4xl mx-auto font-sans pb-16 transition-colors duration-200 bg-white dark:bg-black text-black dark:text-white',
        typographyClasses
      )}
    >
      <ReadingRuler />

      {/* 1. ARTICLE HEADER : TITRE EN GRAND */}
      <div className="space-y-4 pb-2">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.14]">
          {article.title}
        </h1>

        {/* 2. IMAGE DE COUVERTURE SOUS LE TITRE */}
        {article.imageUrl && (
          <div className="relative w-full h-[220px] sm:h-[340px] md:h-[400px] rounded-2xl overflow-hidden border border-border/30 bg-muted/30">
            <Image
              src={article.imageUrl}
              alt={article.title || ''}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
            />
          </div>
        )}

        {/* 3. EN-TÊTE AUTEUR ENRICHI & BARRE D'OUTILS DE LECTURE */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-border/20">
          <div className="flex items-center gap-3 min-w-0">
            <ProfileHoverCard
              user={{
                id: article.author?.id || '',
                name: authorName,
                username: authorHandle,
                logoUrl: article.author?.logoUrl,
                heroText: article.author?.heroText,
                isCertified: article.author?.isCertified,
                isMedia: article.author?.type === 'MEDIA',
                type: article.author?.type,
              }}
              onOpenProfile={onOpenProfile}
            >
              <SafeAvatar
                src={article.author?.logoUrl}
                name={authorName}
                username={authorHandle}
                size={42}
                shape={article.author?.type === 'MEDIA' ? 'squircle' : 'circle'}
                type={article.author?.type === 'MEDIA' ? 'MEDIA' : 'PERSONAL'}
                className={cn(
                  'shrink-0 cursor-pointer shadow-xs',
                  article.author?.type === 'MEDIA' ? 'rounded-xl' : 'rounded-full'
                )}
              />
            </ProfileHoverCard>

            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5 flex-wrap">
                <ProfileHoverCard
                  user={{
                    id: article.author?.id || '',
                    name: authorName,
                    username: authorHandle,
                    logoUrl: article.author?.logoUrl,
                    heroText: article.author?.heroText,
                    isCertified: article.author?.isCertified,
                    isMedia: article.author?.type === 'MEDIA',
                    type: article.author?.type,
                  }}
                  onOpenProfile={onOpenProfile}
                >
                  <span
                    onClick={() => onOpenProfile?.(authorHandle)}
                    className="font-semibold text-[15px] text-foreground hover:underline cursor-pointer truncate"
                  >
                    {authorName}
                  </span>
                </ProfileHoverCard>
                {article.author?.isCertified && <CertifiedBadge />}
                {authorHandle && (
                  <span className="text-xs text-muted-foreground">@{authorHandle}</span>
                )}
              </div>
              {showPublicationLine && publication && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SafeAvatar
                    src={publication.logoUrl ?? null}
                    name={publication.name}
                    username={publication.subdomain}
                    size={16}
                    shape="squircle"
                    type="MEDIA"
                    className="rounded-[4px] shrink-0"
                  />
                  <span>
                    {t`Pour`}{' '}
                    <span className="font-semibold text-foreground/90">{publication.name}</span>
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {article.category && (
                  <>
                    <span className="font-medium text-foreground/80">{article.category.name}</span>
                    <span>·</span>
                  </>
                )}
                <span>{article.readingTime || 5} min de lecture</span>
                <span>·</span>
                <time dateTime={dateIso}>{dateFormatted}</time>
              </div>
            </div>
          </div>

          <div
            ref={toolbar?.authorToolbarRef}
            className={cn(
              'flex items-center gap-2 transition-opacity duration-200',
              toolbar?.isDocked && 'opacity-0 pointer-events-none'
            )}
          >
            {user && user.id !== article.author?.id && (
              <button
                type="button"
                onClick={toggleFollow}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  followed
                    ? 'bg-muted text-foreground hover:bg-muted/80'
                    : 'bg-foreground text-background dark:bg-white dark:text-black hover:opacity-90'
                )}
              >
                {followed ? (
                  <UserCheck className="w-3.5 h-3.5" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>{followed ? t`Abonné` : t`Suivre`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleBookmark}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              title={activeBookmarked ? t`Supprimer des signets` : t`Mettre en signet`}
            >
              {activeBookmarked ? (
                <BookMarked className="w-4 h-4 fill-current text-primary" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              title={activeCopied ? t`Lien copié !` : t`Partager l'article`}
            >
              {activeCopied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>

            <TextToSpeechPlayer
              articleTitle={article.title}
              articleCoverUrl={article.imageUrl}
              authorName={authorName}
              articleContentSelector="#article-content"
            />
            <ReadingSettingsSheet />
          </div>
        </div>
      </div>

      {/* Shared Genius Text Selection Highlighter Engine */}
      <TextHighlighter
        articleId={article.id}
        creatorName={authorName}
        allowPublicAnnotations={article.allowPublicAnnotations ?? true}
        isAuthenticated={!!user}
        initialHighlights={initialHighlights}
        publicHighlights={publicHighlights}
        currentUserId={user?.id || null}
        currentUserProfile={currentUserProfile}
        articleAuthorId={article.author?.id || ''}
        mainAppUrl=""
        containerId="article-content"
        canonicalDocument={canonicalDocument ?? undefined}
        spotlight={spotlight}
        filterMode={toolbar?.filterMode}
        onFilterModeChange={toolbar?.setFilterMode}
        contentClassName={cn(
          'prose prose-sm sm:prose-base dark:prose-invert max-w-none text-foreground/90 selection:bg-foreground selection:text-background cursor-text pt-2 leading-[1.8] antialiased [text-rendering:optimizeLegibility]',
          typographyClasses
        )}
        callbacks={callbacks}
      />

      {/* Article Body HTML — moteur hérité (TreeWalker), masqué en mode
          document canonique (le corps est rendu par CanonicalArticleBody). */}
      {!documentMode && (
        <div
          id="article-content"
          className={cn(
            'prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6 text-foreground/90 selection:bg-foreground selection:text-background cursor-text pt-2 antialiased [text-rendering:optimizeLegibility]',
            typographyClasses
          )}
          dangerouslySetInnerHTML={{ __html: displayedContent }}
        />
      )}

      {/* 💌 Inscription Newsletter (adaptée au tenant de l'artiste uniquement) */}
      {article.author?.id && (
        <div className="my-12 p-6 sm:p-8 rounded-2xl bg-muted/20 dark:bg-card/40 border border-border/30 text-center space-y-4 not-prose shadow-none">
          <div className="max-w-md mx-auto space-y-2">
            {article.author?.logoUrl && (
              <div className="mx-auto w-12 h-12 mb-2 flex items-center justify-center">
                <SafeAvatar
                  src={article.author.logoUrl}
                  name={authorName}
                  username={authorHandle}
                  size={48}
                  shape={article.author?.type === 'MEDIA' ? 'squircle' : 'circle'}
                  type={article.author?.type === 'MEDIA' ? 'MEDIA' : 'PERSONAL'}
                  className="mx-auto shadow-xs"
                />
              </div>
            )}
            <h4 className="text-lg font-bold text-foreground">
              {t`Restez informé des prochains écrits`}
            </h4>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {t`Abonnez-vous à la newsletter de ${authorName} pour recevoir ses publications directement par email.`}
            </p>
          </div>
          <SubscribeForm
            publicationId={article.author.id}
            authorName={authorName || undefined}
            userEmail={user?.email || null}
            accentColor={
              initialSource === 'subdomain'
                ? article.author.accentColor || article.publication?.accentColor || undefined
                : undefined
            }
          />
          <p className="text-[11px] text-muted-foreground/60 pt-1">
            {t`Gratuit · 1-clic · Sans spam · Désabonnement facile`}
          </p>
        </div>
      )}

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
                  : `/${encodeURIComponent(article.publication?.slug || article.author.username || 'article')}/${encodeURIComponent(article.slug)}`
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
