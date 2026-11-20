'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Bookmark,
  BookMarked,
  Check,
  FileX,
  Lock,
  Share2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { createClient } from '@qoe/supabase/client';
import { usePlus } from '@/lib/use-plus';
import {
  TextHighlighter,
  createAnnotationCallbacks,
  appendAnnotation,
  type AnnotationItem,
  type AnnotationActionCallbacks,
  type CanonicalDocument,
  type SpotlightRange,
} from '@qoe/ui/annotations';
import { sanitizeArticleHtml } from '@qoe/ui/security';

import { getCanonicalDocumentAction } from '@/lib/canonical-document';
import {
  getArticleHighlightsAction,
  createHighlightAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  toggleHighlightPrivacyAction,
  updateHighlightNoteAction,
  deleteHighlightAction,
  citeAnnotationAction,
  useArticleShadow,
  useActorShadow,
  updateArticleShadow,
  updateActorShadow,
  withShadowMutation,
} from '@qoe/sdk';
import { ArticleComments } from './ArticleComments';
import {
  toggleBookmarkArticleHomeAction,
  toggleFollowCreatorHomeAction,
} from '@qoe/sdk/actions/feed';
import { SimilarArticlesSection } from './SimilarArticlesSection';
import { ArticleSummary } from './ArticleSummary';
import { useArticleReadingTracker } from '@qoe/analytics';
import {
  SubscribeForm,
  SafeAvatar,
  ProfileHoverCard,
  useAuthModal,
  useFeatureAnnouncement,
} from '@qoe/ui';
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
import { niceDateShort } from '@qoe/formatters';
import { toast } from '@qoe/ui/toast';
import { getArticleUrl } from '@qoe/config';
import { t } from '@lingui/core/macro';
import { useFlag } from '@qoe/flags';
import { Button } from '@qoe/ui/button';
import { useReaderToolbar } from './ReaderToolbarContext';
import { resolveArticleByline } from './article-byline';

export interface ArticleAnnotatorViewProps {
  article: {
    id: string;
    title: string;
    slug: string;
    content: string;
    imageUrl?: string | null;
    coverAlt?: string;
    coverDecorative?: boolean;
    readingTime?: number;
    createdAt: string | Date;
    isPremium?: boolean;
    accessGranted?: boolean;
    isBookmarked?: boolean;
    isFollowed?: boolean;
    originArticleId?: string | null;
    canonicalType?: string;
    canonicalUrl?: string | null;
    originPublisher?: {
      id: string;
      name: string;
      slug: string;
      subdomain?: string | null;
      logoUrl?: string | null;
      customDomain?: string | null;
      type?: string;
    } | null;
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
      isFollowed?: boolean;
      journalist?: {
        id: string;
        name: string | null;
        username: string | null;
        logoUrl: string | null;
        isCertified?: boolean;
      } | null;
    };
    category?: { name: string } | null;
    tags?: string[];
    publisher?: {
      id?: string | null;
      type?: 'PERSONAL' | 'MEDIA' | string | null;
      name?: string | null;
      slug?: string | null;
      subdomain?: string | null;
      logoUrl?: string | null;
      customDomain?: string | null;
      accentColor?: string | null;
      isCertified?: boolean;
    } | null;
    allowPublicAnnotations?: boolean;
    isLoading?: boolean;
    isError?: boolean;
    errorMessage?: string;
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
  /** Profil DB du lecteur (nature media incluse), fourni par le serveur. */
  currentUserProfile?: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  } | null;
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

function ArticleReadingTracker({
  articleId,
  slug,
  readingTimeMinutes,
  initialSource = 'feed',
}: {
  articleId: string;
  slug: string;
  readingTimeMinutes?: number;
  initialSource?: 'feed' | 'subdomain' | 'public_profile' | 'direct';
}) {
  useArticleReadingTracker({
    articleId,
    slug,
    readingTimeMinutes,
    initialSource,
  });

  return null;
}

function ArticleAnnotatorViewInner({
  article,
  initialSource,
  canonicalDocument: canonicalDocumentProp,
  spotlight,
  onOpenProfile,
  currentUserProfile: currentUserProfileProp,
  onClose,
}: ArticleAnnotatorViewProps) {
  const toolbar = useReaderToolbar();
  const { openAuthModal } = useAuthModal();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [highlightsList, setHighlightsList] = useState<AnnotationItem[]>([]);
  const [clientDocument, setClientDocument] = useState<CanonicalDocument | null | undefined>(
    undefined
  );

  useEffect(() => {
    setClientDocument(undefined);
  }, [article.id, article.slug]);
  const [bookmarked, setBookmarked] = useState(article.isBookmarked ?? false);
  const [followed, setFollowed] = useState(
    article.isFollowed ?? article.author?.isFollowed ?? false
  );
  const authorId = article.author?.id;
  const authorUsername = article.author?.username;
  const shadowedArticle = useArticleShadow(article);
  const shadowedAuthor = useActorShadow(article.author);
  const [copied, setCopied] = useState(false);
  // Gate Plus du TTS (fiche P1) : partagé avec la toolbar dockée via le
  // même hook (1 seul appel /v1/me/entitlements par session).
  const isTtsEnabled = useFlag('reader-tts-playback');
  const ttsPlus = usePlus();
  const ttsLocked = ttsPlus === false;
  const featureAnnouncement = useFeatureAnnouncement();
  const ttsUpsell = () => featureAnnouncement.open('audio-tts');

  const activeBookmarked =
    shadowedArticle.isBookmarked ?? (toolbar ? toolbar.bookmarked : bookmarked);
  const activeFollowed = shadowedAuthor.isFollowed ?? followed;
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
    const hasValidId = Boolean(article.id && article.id !== article.slug && !article.isLoading);
    if (!canFetchDocument || !hasValidId) return;
    let cancelled = false;
    (async () => {
      // Un échec de transport retombe sur le moteur hérité (`null`), jamais
      // sur un rejet non géré ni sur un squelette qui ne se résout pas.
      const doc = await getCanonicalDocumentAction(article.id).catch(() => null);
      if (!cancelled) setClientDocument(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    article.id,
    article.slug,
    article.isLoading,
    article.isPremium,
    article.accessGranted,
    canonicalDocumentProp,
  ]);

  // Fetch current user auth state
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (alive && data?.user) {
          setUser(data.user);
        }
      })
      // Session illisible (hors ligne, jeton expiré) : l'article reste lisible
      // en anonyme, et aucun rejet ne remonte.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Fetch article highlights — une réponse qui arrive après un changement
  // d'article est ignorée : sans cette garde, les surlignages de l'article
  // précédent se peignaient sur le nouveau et une sélection héritait d'un
  // identifiant de surlignage qui ne lui appartenait pas.
  useEffect(() => {
    const hasValidId = Boolean(article.id && article.id !== article.slug && !article.isLoading);
    if (!hasValidId) return;
    let cancelled = false;
    setHighlightsList([]);
    async function loadHighlights() {
      try {
        const res = await getArticleHighlightsAction({ articleId: article.id });
        if (!cancelled && res.ok && res.data?.highlights) {
          setHighlightsList(res.data.highlights);
        }
      } catch (err) {
        if (!cancelled) console.error('Error loading highlights:', err);
      }
    }
    void loadHighlights();
    return () => {
      cancelled = true;
    };
  }, [article.id, article.slug, article.isLoading]);

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
          // ✍️ Sans cette action, « Annoter » depuis le tiroir ne modifiait
          // que l’état local : la note disparaissait au rechargement et le
          // surlignage redevenait nu (le tenant, lui, la passait déjà).
          updateHighlightNoteAction,
          deleteHighlightAction: (id) =>
            deleteHighlightAction(typeof id === 'string' ? { highlightId: id } : id),
          // 🧾 Publie l'annotation (note + passage + auteur) comme citation
          // sur Qoefi. Le serveur recharge l'annotation : le tiroir ne fait
          // que désigner CE QU'IL faut citer.
          citeAnnotationAction,
          onLoginRedirect: () => openAuthModal({ mode: 'login' }),
        },
        {
          onHighlightCreate: async (params) => {
            const res = (await createHighlightAction({
              articleId: params.articleId || article.id,
              text: params.text,
              note: params.note ?? undefined,
              isPublic: !!params.isPublic,
              ...(params.quoteOrdinal !== undefined ? { quoteOrdinal: params.quoteOrdinal } : {}),
            })) as { ok?: boolean; data?: { highlight?: unknown }; error?: unknown };

            if (res?.ok && res.data?.highlight) {
              const createdHighlight = res.data.highlight as AnnotationItem;
              setHighlightsList((prev) => appendAnnotation(prev, createdHighlight));
              return { ok: true, data: createdHighlight };
            }
            return res?.ok !== undefined
              ? (res as never)
              : { ok: true, data: (res?.data ?? res) as never };
          },
          onDelete: async (highlightId: string) => {
            const res = (await deleteHighlightAction(
              typeof highlightId === 'string' ? { highlightId } : highlightId
            )) as { ok?: boolean };
            if (res?.ok !== false) {
              setHighlightsList((prev) => prev.filter((h) => h.id !== highlightId));
            }
            return res as never;
          },
          onUpdateNote: async (params) => {
            const res = (await updateHighlightNoteAction({
              highlightId: params.highlightId,
              note: params.note ?? null,
            })) as { ok?: boolean; data?: { highlight?: unknown } };
            if (res?.ok) {
              setHighlightsList((prev) =>
                prev.map((h) =>
                  h.id === params.highlightId ? { ...h, note: params.note ?? null } : h
                )
              );
            }
            return res as never;
          },
          onTogglePrivacy: async (params) => {
            const res = (await toggleHighlightPrivacyAction({
              highlightId: params.highlightId,
              isPublic: params.isPublic,
            })) as { ok?: boolean; data?: { highlight?: unknown } };
            if (res?.ok) {
              setHighlightsList((prev) =>
                prev.map((h) =>
                  h.id === params.highlightId ? { ...h, isPublic: params.isPublic } : h
                )
              );
            }
            return res as never;
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
                        subdomain: article.author.subdomain || article.publisher?.subdomain,
                        customDomain:
                          article.author.customDomain || article.publisher?.customDomain,
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
    [article, openAuthModal]
  );

  // Synchronisation des signets et abonnements
  useEffect(() => {
    if (article.isBookmarked !== undefined) {
      setBookmarked(article.isBookmarked);
      toolbar?.setBookmarked(article.isBookmarked);
    }
  }, [article.isBookmarked, toolbar]);

  useEffect(() => {
    const nextFollowed = article.isFollowed ?? article.author?.isFollowed;
    if (nextFollowed !== undefined) {
      setFollowed(nextFollowed);
    }
  }, [article.isFollowed, article.author?.isFollowed]);

  const toggleBookmark = React.useCallback(async () => {
    if (!user) {
      openAuthModal({ mode: 'login' });
      return;
    }
    const hasValidId = Boolean(article.id && article.id !== article.slug && !article.isLoading);
    if (!hasValidId) return;

    const previousBookmarked = activeBookmarked;
    const nextBookmarked = !activeBookmarked;

    await withShadowMutation({
      lockKey: `article:${article.id}:bookmark`,
      optimisticUpdate: () => {
        setBookmarked(nextBookmarked);
        toolbar?.setBookmarked(nextBookmarked);
        updateArticleShadow(article.id, { bookmarked: nextBookmarked });
      },
      rollback: () => {
        setBookmarked(previousBookmarked);
        toolbar?.setBookmarked(previousBookmarked);
        updateArticleShadow(article.id, { bookmarked: previousBookmarked });
      },
      // F264 : un refus serveur rend l'état précédent **et** le dit, au lieu
      // de laisser le bouton sans effet visible.
      onError: () => toast.error(t`Le signet n'a pas pu être enregistré. Réessaie.`),
      mutation: async () => {
        const res = await toggleBookmarkArticleHomeAction(article.id);
        if (!res.ok) {
          throw new Error('Échec mise en signet');
        }
        if (res.data?.bookmarked !== undefined) {
          setBookmarked(res.data.bookmarked);
          toolbar?.setBookmarked(res.data.bookmarked);
          updateArticleShadow(article.id, { bookmarked: res.data.bookmarked });
        }
      },
    });
  }, [user, activeBookmarked, toolbar, article.id, article.slug, article.isLoading, openAuthModal]);

  useEffect(() => {
    if (toolbar?.registerToggleBookmark) {
      toolbar.registerToggleBookmark(toggleBookmark);
    }
  }, [toolbar, toggleBookmark]);

  const toggleFollow = React.useCallback(async () => {
    if (!user) {
      openAuthModal({ mode: 'login' });
      return;
    }
    if (!authorId || authorId === 'loading') return;

    const previousFollowed = activeFollowed;
    const nextFollowed = !activeFollowed;

    await withShadowMutation({
      lockKey: `actor:${authorId}:follow`,
      optimisticUpdate: () => {
        setFollowed(nextFollowed);
        updateActorShadow(authorId, { followed: nextFollowed });
        if (authorUsername) updateActorShadow(authorUsername, { followed: nextFollowed });
      },
      rollback: () => {
        setFollowed(previousFollowed);
        updateActorShadow(authorId, { followed: previousFollowed });
        if (authorUsername) updateActorShadow(authorUsername, { followed: previousFollowed });
      },
      onError: () => toast.error(t`Le suivi n'a pas pu être enregistré. Réessaie.`),
      mutation: async () => {
        const res = await toggleFollowCreatorHomeAction(authorId);
        if (!res.ok) {
          throw new Error('Échec suivi créateur');
        }
      },
    });
  }, [user, activeFollowed, authorId, authorUsername, openAuthModal]);

  // Repli sans provider : même contrat que `ReaderToolbarProvider.handleShare`
  // — « Copié » n'est annoncé que si l'écriture a réussi, le minuteur est
  // annulable, et un presse-papier refusé ne laisse pas de promesse en l'air.
  const copiedTimerRef = React.useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    },
    []
  );

  const handleShare = React.useCallback(async () => {
    if (toolbar?.handleShare) {
      toolbar.handleShare();
      return;
    }
    if (typeof window === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      // Presse-papier refusé (permission, contexte non sécurisé) : on n'annonce
      // pas « Copié » et la promesse reste gérée.
      setCopied(false);
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

  // Le profil serveur porte `type` (MEDIA pour un membre média actif). Le
  // repli Supabase ne le connaît pas : forme ronde par défaut, jamais inventée.
  const currentUserProfile =
    currentUserProfileProp ??
    (user
      ? {
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
          username: user.user_metadata?.username || null,
          logoUrl: user.user_metadata?.avatar_url || null,
        }
      : null);

  const { preferences } = useReadingPreferences();
  const typographyClasses = getReaderTypographyClasses(preferences);

  // Le corps passe par la liste blanche partagée, quel que soit le chemin
  // (HTML brut, lecture bionique). Le mode canonique n'utilise pas ce HTML :
  // il est rendu par CanonicalArticleBody.
  const displayedContent = React.useMemo(() => {
    if (!article.content) return '';
    const html = preferences.bionicReading ? formatBionicHtml(article.content) : article.content;
    return sanitizeArticleHtml(html);
  }, [article.content, preferences.bionicReading]);

  // ✍️ Signature de l'article (média vs auteur) : résolution partagée avec le
  // tiroir de lecture — une seule règle, donc un seul endroit à corriger (R132).
  const {
    isMedia,
    mediaName,
    mediaHandle,
    mediaLogo,
    mediaCertified,
    writerId,
    writerName,
    writerHandle,
    writerAvatar,
    writerCertified,
    personalAuthorName,
    personalAuthorHandle,
    personalAuthorAvatar,
    personalAuthorCertified,
    authorName,
    authorHandle,
    targetFollowId,
  } = React.useMemo(() => resolveArticleByline(article), [article]);

  // 📅 La primitive partagée rend `null` sur une entrée illisible, là où
  // `Date#toISOString()` jetait un `RangeError` pendant le rendu et cassait
  // tout l'article : une date douteuse ne prive plus le lecteur du texte.
  const dateObj = article.createdAt ? new Date(article.createdAt) : new Date();
  const hasValidDate = !Number.isNaN(dateObj.getTime());
  const dateFormatted = hasValidDate ? niceDateShort(dateObj) : null;
  const dateIso = hasValidDate ? dateObj.toISOString() : null;

  if (article.isError) {
    return (
      <div className="relative w-full max-w-xl mx-auto font-sans py-20 px-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
          <FileX className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-foreground">{t`Article indisponible`}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {article.errorMessage ||
            t`Cet article n'est plus accessible ou est en cours de modification.`}
        </p>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
            {t`Fermer`}
          </Button>
        )}
      </div>
    );
  }

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
        'relative w-full space-y-6 max-w-4xl mx-auto font-sans pb-16 transition-colors duration-200 bg-white dark:bg-black text-black dark:text-white'
      )}
    >
      <ReadingRuler />

      {/* 📊 High-precision reading tracker isolé pour éviter tout re-render de l'article */}
      {Boolean(article.id && article.id !== article.slug && !article.isLoading) && (
        <ArticleReadingTracker
          articleId={article.id}
          slug={article.slug}
          readingTimeMinutes={article.readingTime || 5}
          initialSource={initialSource}
        />
      )}

      {/* 1. ARTICLE HEADER : TITRE EN GRAND */}
      <div className="space-y-4 pb-2">
        {article.originPublisher && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span>{t`Publié à l'origine dans`}</span>
            {article.canonicalUrl ? (
              <a
                href={article.canonicalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground font-semibold hover:text-primary hover:underline"
              >
                {article.originPublisher.name}
              </a>
            ) : (
              <span className="text-foreground font-semibold">{article.originPublisher.name}</span>
            )}
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.14]">
          {article.title}
        </h1>

        {/* 1b. RÉSUMÉ IA (fiche Plus P1) : replié par défaut, servi à la
         * demande (quotas), toujours présenté comme IA. */}
        {article.id && (
          <div className="pt-1">
            <ArticleSummary articleId={article.id} />
          </div>
        )}

        {/* 2. IMAGE DE COUVERTURE SOUS LE TITRE */}
        {article.imageUrl && (
          <div className="relative w-full h-[220px] sm:h-[340px] md:h-[400px] rounded-2xl overflow-hidden border border-border/30 bg-muted/30">
            <Image
              src={article.imageUrl}
              alt={article.coverDecorative ? '' : article.coverAlt?.trim() || article.title || ''}
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
            {isMedia ? (
              <>
                {/* ── Cas Média : Grand logo du Média en squircle ── */}
                <ProfileHoverCard
                  user={{
                    id: article.publisher?.id || '',
                    name: mediaName,
                    username: mediaHandle,
                    logoUrl: mediaLogo,
                    isCertified: mediaCertified,
                    isMedia: true,
                    type: 'MEDIA',
                  }}
                  onOpenProfile={onOpenProfile}
                >
                  <SafeAvatar
                    src={mediaLogo}
                    name={mediaName}
                    username={mediaHandle}
                    size={42}
                    shape="squircle"
                    type="MEDIA"
                    className="shrink-0 cursor-pointer shadow-xs rounded-xl"
                  />
                </ProfileHoverCard>

                <div className="min-w-0 leading-tight">
                  {/* Titre : Nom du Média */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ProfileHoverCard
                      user={{
                        id: article.publisher?.id || '',
                        name: mediaName,
                        username: mediaHandle,
                        logoUrl: mediaLogo,
                        isCertified: mediaCertified,
                        isMedia: true,
                        type: 'MEDIA',
                      }}
                      onOpenProfile={onOpenProfile}
                    >
                      <span
                        onClick={() => mediaHandle && onOpenProfile?.(mediaHandle)}
                        className="font-semibold text-[15px] text-foreground hover:underline cursor-pointer truncate"
                      >
                        {mediaName}
                      </span>
                    </ProfileHoverCard>
                    {mediaCertified && <CertifiedBadge />}
                  </div>

                  {/* Signature : par <Auteur> */}
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    <span>{t`par`}</span>
                    <ProfileHoverCard
                      user={{
                        id: writerId,
                        name: writerName,
                        username: writerHandle,
                        logoUrl: writerAvatar,
                        isCertified: writerCertified,
                        isMedia: false,
                        type: 'PERSONAL',
                      }}
                      onOpenProfile={onOpenProfile}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (writerHandle) onOpenProfile?.(writerHandle);
                        }}
                        className="inline-flex items-center gap-1.5 cursor-pointer hover:underline text-foreground/90 font-medium"
                      >
                        <SafeAvatar
                          src={writerAvatar}
                          name={writerName}
                          username={writerHandle}
                          size={16}
                          shape="circle"
                          type="PERSONAL"
                          className="rounded-full shrink-0"
                        />
                        <span>{writerName}</span>
                        {writerCertified && <CertifiedBadge />}
                        {writerHandle && (
                          <span className="text-muted-foreground font-normal">@{writerHandle}</span>
                        )}
                      </span>
                    </ProfileHoverCard>
                  </div>

                  {/* Métadonnées : Catégorie · temps de lecture · date */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {article.category && (
                      <>
                        <span className="font-medium text-foreground/80">
                          {article.category.name}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    <span>{t`${article.readingTime || 5} min de lecture`}</span>
                    {dateFormatted && (
                      <>
                        <span>·</span>
                        <time dateTime={dateIso ?? undefined}>{dateFormatted}</time>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── Cas Personnel : Grand avatar de l'Auteur en cercle ── */}
                <ProfileHoverCard
                  user={{
                    id: article.author?.id || '',
                    name: personalAuthorName,
                    username: personalAuthorHandle,
                    logoUrl: personalAuthorAvatar,
                    heroText: article.author?.heroText,
                    isCertified: personalAuthorCertified,
                    isMedia: false,
                    type: 'PERSONAL',
                  }}
                  onOpenProfile={onOpenProfile}
                >
                  <SafeAvatar
                    src={personalAuthorAvatar}
                    name={personalAuthorName}
                    username={personalAuthorHandle}
                    size={42}
                    shape="circle"
                    type="PERSONAL"
                    className="shrink-0 cursor-pointer shadow-xs rounded-full"
                  />
                </ProfileHoverCard>

                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ProfileHoverCard
                      user={{
                        id: article.author?.id || '',
                        name: personalAuthorName,
                        username: personalAuthorHandle,
                        logoUrl: personalAuthorAvatar,
                        heroText: article.author?.heroText,
                        isCertified: personalAuthorCertified,
                        isMedia: false,
                        type: 'PERSONAL',
                      }}
                      onOpenProfile={onOpenProfile}
                    >
                      <span
                        onClick={() => onOpenProfile?.(personalAuthorHandle)}
                        className="font-semibold text-[15px] text-foreground hover:underline cursor-pointer truncate"
                      >
                        {personalAuthorName}
                      </span>
                    </ProfileHoverCard>
                    {personalAuthorCertified && <CertifiedBadge />}
                    {personalAuthorHandle && (
                      <span className="text-xs text-muted-foreground">@{personalAuthorHandle}</span>
                    )}
                  </div>

                  {/* Métadonnées */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {article.category && (
                      <>
                        <span className="font-medium text-foreground/80">
                          {article.category.name}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    <span>{t`${article.readingTime || 5} min de lecture`}</span>
                    {dateFormatted && (
                      <>
                        <span>·</span>
                        <time dateTime={dateIso ?? undefined}>{dateFormatted}</time>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            ref={toolbar?.authorToolbarRef}
            className={cn(
              'flex items-center gap-2 transition-opacity duration-200',
              toolbar?.isDocked && 'opacity-0 pointer-events-none'
            )}
          >
            {user && user.id !== targetFollowId && (
              <Button
                variant={activeFollowed ? 'soft' : 'solid'}
                tone={activeFollowed ? 'neutral' : 'brand'}
                size="sm"
                onClick={toggleFollow}
                className="rounded-full text-xs font-semibold cursor-pointer"
              >
                {activeFollowed ? (
                  <UserCheck className="w-3.5 h-3.5" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>{activeFollowed ? t`Abonné` : t`Suivre`}</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleBookmark}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer h-8 w-8"
              title={activeBookmarked ? t`Supprimer des signets` : t`Mettre en signet`}
            >
              {activeBookmarked ? (
                <BookMarked className="w-4 h-4 fill-current text-primary" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer h-8 w-8"
              title={activeCopied ? t`Lien copié !` : t`Partager l'article`}
            >
              {activeCopied ? (
                <Check className="w-4 h-4 text-success-text" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </Button>

            {isTtsEnabled && (
              <TextToSpeechPlayer
                articleTitle={article.title}
                articleCoverUrl={article.imageUrl}
                authorName={authorName}
                articleContentSelector="#article-content"
                locked={ttsLocked}
                onLockedClick={ttsUpsell}
              />
            )}
            <ReadingSettingsSheet
              plusThemesLocked={ttsLocked}
              onLockedThemeClick={() => featureAnnouncement.open('reading-papers')}
              filterMode={toolbar?.filterMode}
              onFilterModeChange={toolbar?.setFilterMode}
              allowPublicAnnotations={article.allowPublicAnnotations ?? true}
            />
          </div>
        </div>
      </div>

      {/* Shared Genius Text Selection Highlighter Engine */}
      <TextHighlighter
        articleId={article.id}
        creatorName={authorName}
        allowPublicAnnotations={article.allowPublicAnnotations ?? true}
        isAuthenticated={Boolean(user || currentUserProfile)}
        onRequireAuth={() => openAuthModal({ mode: 'login' })}
        initialHighlights={initialHighlights}
        publicHighlights={publicHighlights}
        currentUserId={user?.id || currentUserProfile?.id || null}
        currentUserProfile={currentUserProfile}
        articleAuthorId={article.author?.id || ''}
        mainAppUrl=""
        containerId="article-content"
        canonicalDocument={canonicalDocument ?? undefined}
        spotlight={spotlight}
        filterMode={toolbar?.filterMode}
        onFilterModeChange={toolbar?.setFilterMode}
        contentClassName={cn(
          'article-prose max-w-none text-foreground/90 cursor-text pt-2 antialiased [text-rendering:optimizeLegibility]',
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
            'article-prose max-w-none text-foreground/90 cursor-text pt-2 antialiased [text-rendering:optimizeLegibility]',
            typographyClasses
          )}
          dangerouslySetInnerHTML={{ __html: displayedContent }}
        />
      )}

      {/* 💬 Discussion de l'article (même contrat Go que les sites tenants). */}
      <ArticleComments
        articleId={article.id}
        currentUserId={user?.id || currentUserProfile?.id || null}
      />

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
            publisherId={article.author.id}
            authorName={authorName || undefined}
            userEmail={user?.email || null}
            accentColor={
              initialSource === 'subdomain'
                ? article.author.accentColor || article.publisher?.accentColor || undefined
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
            {t`Écrit réservé aux membres Premium`}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {t`La suite de cette publication est exclusivement réservée aux abonnés de`}{' '}
            <strong className="text-foreground">
              {article.author.name || article.author.username}
            </strong>
            .
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={getArticleUrl(article, { preferTenant: true, absolute: true })}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-highlight text-black font-bold text-xs sm:text-sm hover:bg-highlight/90 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {t`S'abonner pour débloquer`}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
