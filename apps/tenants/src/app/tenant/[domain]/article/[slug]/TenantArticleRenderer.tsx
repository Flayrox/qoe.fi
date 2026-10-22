import React from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { SubscribeForm, JsonLd, buildArticleSchema, SafeAvatar } from '@qoe/ui';
import { buildArticlePath } from '@qoe/utils';
import { type AnnotationItem, type HighlightItem } from '@qoe/ui/annotations';
import { TenantArticleHighlighter } from './TenantArticleHighlighter';
import { TenantArticleReadingTracker } from './TenantArticleReadingTracker';
import { type CommentItem, ArticleCommentsSection } from './ArticleCommentsSection';
import { PaywallOverlay } from './PaywallCut';
import { sanitizeHtml } from '@/lib/sanitize';
import { ReaderActions } from './ReaderActions';
import { TenantReaderShell } from './TenantReaderShell';
import { RelatedArticles } from './RelatedArticles';
import {
  TemplateRenderer,
  parseSiteLayouts,
  resolveFontFamily,
  MinimalCraftShell,
  ArticleEngagementBar,
  type TemplatePublicationContext,
  type TemplateArticleItem,
} from '@qoe/ui/templates';
import { buildPublicDescription, sliceContentAtPaywall } from '@qoe/utils';
import { ContentVisibility, getMainAppUrl } from '@qoe/config';
import { t } from '@lingui/core/macro';
import {
  fetchCanonicalDocument,
  type TenantPublication,
  type TenantArticle,
} from '@/lib/tenant-data';
import type { User } from '@supabase/supabase-js';

export interface TenantArticleRendererProps {
  publication: TenantPublication;
  article: TenantArticle;
  user: User | null;
  bundle: {
    bookmarked: boolean;
    followed: boolean;
    entitlements: {
      isMember: boolean;
      isPaidSubscriber: boolean;
    };
  };
  decodedDomain: string;
  initialBookmarked: boolean;
  initialFollowed: boolean;
  initialHighlights: HighlightItem[];
  publicHighlights: AnnotationItem[];
  initialComments: CommentItem[];
  breadcrumbJsonLd?: Record<string, unknown> | null;
}

export async function TenantArticleRenderer({
  publication,
  article,
  user,
  bundle,
  decodedDomain,
  initialBookmarked,
  initialFollowed,
  initialHighlights,
  publicHighlights,
  initialComments,
  breadcrumbJsonLd,
}: TenantArticleRendererProps) {
  const { name, accentColor, fontFamily, themeMode, navigation, socialLinks } = publication;

  const authorName = article.author?.name || article.author?.username || name;
  const showAnnotationsOption =
    (publication as { siteOptions?: Record<string, boolean> | null })?.siteOptions
      ?.showAnnotations ??
    (publication as { site_options?: Record<string, boolean> | null })?.site_options
      ?.showAnnotations ??
    true;
  const allowPublicAnnotations =
    (publication.allowPublicAnnotations ?? true) &&
    (article.allowPublicAnnotations ?? true) &&
    showAnnotationsOption !== false;
  const allowComments = (publication.allowComments ?? true) && (article.allowComments ?? true);
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;
  const mainAppUrl = getMainAppUrl(host);
  // Thème unique : Minimal Craft, quel que soit le layoutStyle historique.
  const siteLayouts = parseSiteLayouts('minimal');

  const articleLayout =
    (article.category?.slug && siteLayouts.articleByCategory[article.category.slug]) ||
    siteLayouts.article ||
    null;

  const effectiveFontFamily =
    fontFamily ||
    articleLayout?.tokens?.fontFamily ||
    siteLayouts.home?.tokens?.fontFamily ||
    'sans';

  const customStyle = {
    '--tenant-accent': accentColor || '#C04328',
    fontFamily: resolveFontFamily(effectiveFontFamily),
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const plainText = (article.content || '').replace(/<[^>]*>?/gm, '');
  const wordCount = plainText.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const articleExcerpt =
    (article as unknown as { subtitle?: string }).subtitle ||
    (article as unknown as { excerpt?: string }).excerpt ||
    (plainText ? plainText.slice(0, 160).trim() + (plainText.length > 160 ? '…' : '') : '');

  const rawAuthors = (
    article as unknown as {
      authors?: Array<{ name?: string | null; username?: string | null; logoUrl?: string | null }>;
    }
  ).authors;

  const authorsList: Array<{ name: string; logoUrl?: string | null }> =
    rawAuthors && rawAuthors.length > 0
      ? rawAuthors.map((a) => ({
          name: a.name || a.username || 'Auteur',
          logoUrl: a.logoUrl || null,
        }))
      : [
          {
            name: authorName,
            logoUrl: article.author?.logoUrl || publication.logoUrl || null,
          },
        ];

  const formatAuthorNames = (list: Array<{ name: string }>) => {
    const names = list.map((a) => a.name).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  };
  const authorsDisplayName = formatAuthorNames(authorsList);

  // Paywall entitlements & truncation sans fuite
  const isAuthor = user?.id === article.authorId;
  const isPaidSubscriber = isAuthor || bundle.entitlements.isPaidSubscriber;
  const isMember = isAuthor || bundle.entitlements.isMember;

  const visibility = article.isPremium
    ? ContentVisibility.PAID_SUBSCRIBERS
    : ContentVisibility.PUBLIC;

  const paywallCutResult =
    article.accessGranted === false
      ? {
          content: article.content,
          isTruncated: true,
          accessGranted: false,
          paywallMeta: null,
        }
      : sliceContentAtPaywall(article.content || '', { isMember, isPaidSubscriber }, visibility);

  const templatePublication: TemplatePublicationContext = {
    id: publication.id,
    name: publication.name,
    domain: decodedDomain,
    mainAppUrl,
    logoUrl: publication.logoUrl,
    heroText: publication.heroText,
    accentColor: publication.accentColor,
    fontFamily: publication.fontFamily,
    themeMode: publication.themeMode,
    navigation: navigation as TemplatePublicationContext['navigation'],
    socialLinks: socialLinks as TemplatePublicationContext['socialLinks'],
    categories: (publication.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
      parentId: c.parentId ?? null,
    })),
    supportUrl: publication.supportUrl,
    stripeAccountId: publication.stripeAccountId,
    siteOptions:
      (
        publication as {
          siteOptions?: Record<string, boolean> | null;
          site_options?: Record<string, boolean> | null;
        }
      ).siteOptions ??
      (
        publication as {
          siteOptions?: Record<string, boolean> | null;
          site_options?: Record<string, boolean> | null;
        }
      ).site_options ??
      null,
    author: {
      name: publication.user?.name ?? publication.name,
      username: publication.user?.username ?? publication.subdomain ?? null,
      avatarUrl: publication.user?.logoUrl ?? null,
      bio: publication.bio ?? null,
    },
  };

  const templateArticle: TemplateArticleItem = {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: paywallCutResult.content,
    excerpt: articleExcerpt,
    subtitle: (article as unknown as { subtitle?: string }).subtitle ?? undefined,
    imageUrl: article.imageUrl || null,
    publishedAt: article.createdAt,
    readingTime: readingTimeMinutes,
    isPremium: article.isPremium,
    category: article.category
      ? { name: article.category.name, slug: article.category.slug }
      : null,
    author: article.author
      ? {
          name: article.author.name,
          username: article.author.username,
          logoUrl: article.author.logoUrl,
        }
      : null,
    authors: authorsList,
  };

  const drawerArticles: TemplateArticleItem[] = (publication.articles ?? []).map((art) => ({
    id: art.id,
    title: art.title,
    slug: art.slug,
    readingTime: art.readingTime,
    publishedAt: art.createdAt,
    category: art.category ? { name: art.category.name, slug: art.category.slug } : null,
  }));

  // Document canonique pour annotations et offsets
  const canonicalDocument = !paywallCutResult.isTruncated
    ? await fetchCanonicalDocument(article.id)
    : null;

  const jsonLdData = buildArticleSchema({
    path: buildArticlePath(article),
    title: article.title,
    description: buildPublicDescription(paywallCutResult.content),
    slug: article.slug,
    createdAt: article.createdAt,
    authorName,
    authorUsername: article.author?.username,
    authorLogo: article.author?.logoUrl,
    coverImage: article.imageUrl || publication.headerImageUrl || article.author?.logoUrl,
    baseUrl: `https://${decodedDomain}`,
  });

  const currentUserProfile: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  } | null = user
    ? {
        id: user.id,
        name:
          (user.user_metadata?.name as string) ?? (user.user_metadata?.full_name as string) ?? null,
        username:
          (user.user_metadata?.username as string) ??
          (user.user_metadata?.user_name as string) ??
          null,
        logoUrl: (user.user_metadata?.avatar_url as string) ?? null,
      }
    : null;

  const articleBodyContent = (
    <>
      <TenantArticleReadingTracker
        articleId={article.id}
        slug={article.slug}
        readingTimeMinutes={readingTimeMinutes}
        initialSource="subdomain"
      />
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
        {articleLayout ? (
          <div className="relative">
            {/* Surligneur Genius et moteur de sélections (rendu avec le corps d'article ou barre d'annotations en haut) */}
            <TenantArticleHighlighter
              articleId={article.id}
              creatorName={authorName || t`L'Auteur`}
              allowPublicAnnotations={allowPublicAnnotations}
              isAuthenticated={!!user}
              initialHighlights={initialHighlights}
              publicHighlights={publicHighlights as AnnotationItem[]}
              currentUserId={user?.id || null}
              currentUserProfile={currentUserProfile}
              articleAuthorId={article.authorId}
              mainAppUrl={mainAppUrl}
              canonicalDocument={canonicalDocument}
              contentClassName="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6"
            />
            <TemplateRenderer
              config={articleLayout}
              publication={templatePublication}
              articles={drawerArticles}
              article={templateArticle}
              standaloneShell={false}
              mode="live"
            />
            {article.isPremium && !paywallCutResult.accessGranted && (
              <PaywallOverlay
                name={authorName}
                isBrutalist={false}
                accentColor={accentColor}
                mainAppUrl={mainAppUrl}
                creatorId={article.authorId}
                initialAuthenticated={!!user}
                initialUser={
                  user
                    ? {
                        name:
                          (user.user_metadata?.name as string) ??
                          (user.user_metadata?.full_name as string) ??
                          null,
                        email: user.email ?? null,
                      }
                    : null
                }
              />
            )}
          </div>
        ) : (
          <>
            {/* En-tête épuré d'orfèvre Devouring Details / Rauno */}
            <header className="mt-4 sm:mt-8 mb-10 space-y-6 sm:space-y-8">
              {/* 1. Grand titre h1 */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.18]">
                {article.title}
              </h1>

              {/* 2. Sous-titre / Chapô descriptif (uniquement si explicitement renseigné) */}
              {((article as unknown as { subtitle?: string | null }).subtitle ||
                (article as unknown as { seoDescription?: string | null }).seoDescription) && (
                <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed font-normal">
                  {(article as unknown as { subtitle?: string | null }).subtitle ||
                    (article as unknown as { seoDescription?: string | null }).seoDescription}
                </p>
              )}

              {/* 3. Ligne Byline Auteur(s) détaillée avec stack d'avatars */}
              <div className="flex items-center gap-3 py-2 select-none">
                <div className="flex items-center -space-x-2 shrink-0">
                  {authorsList.map((auth, idx) => (
                    <SafeAvatar
                      key={idx}
                      src={auth.logoUrl}
                      name={auth.name}
                      size={40}
                      shape="circle"
                      className="border-2 border-background ring-1 ring-border/40 shrink-0 shadow-2xs"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  {authorsDisplayName && (
                    <div className="text-xs font-bold uppercase tracking-wider text-foreground leading-tight truncate">
                      {authorsDisplayName}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <time dateTime={article.createdAt}>
                      {new Date(article.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="uppercase font-semibold tracking-wider text-[10px]">
                      {article.isPremium ? 'PAYANT' : 'GRATUIT'}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{readingTimeMinutes} min</span>
                  </div>
                </div>
              </div>

              {/* 4. Barre d'engagement (Likes, Commentaires, Repost, Partager) */}
              <div className="py-2 my-6">
                <ArticleEngagementBar
                  articleId={article.id}
                  articleSlug={article.slug}
                  articleTitle={article.title}
                  initialLikes={article.likesCount ?? 0}
                  initialComments={initialComments.length || (article.commentsCount ?? 0)}
                  initialReposts={article.repostsCount ?? 0}
                  initialIsLiked={article.isLiked ?? false}
                  initialIsReposted={article.isReposted ?? false}
                  size="md"
                  showShareText={true}
                />
              </div>

              {/* 5. Couverture article : image réelle ou composition vectorielle déterministe */}
              {article.imageUrl && (
                <div className="mt-8 mb-10 -mx-4 sm:-mx-8 md:-mx-12">
                  <div className="relative aspect-[16/9] sm:aspect-[2/1] rounded-2xl overflow-hidden border border-border/40 bg-muted/30 shadow-2xs">
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </header>

            {/* Surligneur Genius et moteur de sélections (rendu avec le corps d'article ou barre d'annotations en haut) */}
            <TenantArticleHighlighter
              articleId={article.id}
              creatorName={authorName || t`L'Auteur`}
              allowPublicAnnotations={allowPublicAnnotations}
              isAuthenticated={!!user}
              initialHighlights={initialHighlights}
              publicHighlights={publicHighlights as AnnotationItem[]}
              currentUserId={user?.id || null}
              currentUserProfile={currentUserProfile}
              articleAuthorId={article.authorId}
              mainAppUrl={mainAppUrl}
              canonicalDocument={canonicalDocument}
              contentClassName="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6"
            />

            {/* Corps de l'article de secours (HTML tronqué) + Paywall si document non canonique (article restreint/payant) */}
            {!canonicalDocument && (
              <>
                <div
                  id="article-content"
                  className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(paywallCutResult.content) }}
                />
                {article.isPremium && !paywallCutResult.accessGranted && (
                  <PaywallOverlay
                    name={authorName}
                    isBrutalist={false}
                    accentColor={accentColor}
                    mainAppUrl={mainAppUrl}
                    creatorId={article.authorId}
                    initialAuthenticated={!!user}
                    initialUser={
                      user
                        ? {
                            name:
                              (user.user_metadata?.name as string) ??
                              (user.user_metadata?.full_name as string) ??
                              null,
                            email: user.email ?? null,
                          }
                        : null
                    }
                  />
                )}
              </>
            )}
          </>
        )}
        <RelatedArticles
          domain={decodedDomain}
          currentSlug={article.slug}
          categorySlug={article.category?.slug ?? null}
          categoryName={article.category?.name ?? null}
        />

        {/* Section commentaires */}
        <ArticleCommentsSection
          articleId={article.id}
          initialComments={initialComments}
          isAuthenticated={!!user}
          currentUserId={user?.id || null}
          allowComments={allowComments}
          mainAppUrl={mainAppUrl}
          isBrutalist={false}
        />

        {/* Section abonnement */}
        <section
          id="subscribe"
          className="mt-16 pt-10 border-t border-border/60"
          style={{ fontFamily: resolveFontFamily(effectiveFontFamily) }}
        >
          <div className="max-w-xl">
            <h3 className="text-2xl font-semibold tracking-tight">
              {t`Restez informé des prochaines publications`}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t`Abonnez-vous gratuitement à la newsletter de `}
              <strong className="text-foreground font-medium">{name}</strong>{' '}
              {t`pour recevoir les prochains écrits dans votre boîte mail.`}
            </p>
            <div className="mt-5">
              <SubscribeForm
                publicationId={publication.id}
                isBrutalist={false}
                userEmail={user?.email || null}
                authorName={name}
              />
            </div>
          </div>
        </section>

        {/* Pied de page sobre : pages de la publication + documents de la plateforme */}
        <footer className="mt-12 border-t border-border/60 pt-6 pb-2 text-[11px] text-muted-foreground">
          <nav aria-label="Liens de la publication" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/about" className="hover:text-foreground transition-colors">
              {t`À propos`}
            </Link>
            <Link href="/team" className="hover:text-foreground transition-colors">
              {t`Équipe`}
            </Link>
            <Link href="/sitemap" className="hover:text-foreground transition-colors">
              {t`Plan du site`}
            </Link>
            <a href="/rss.xml" className="hover:text-foreground transition-colors">
              RSS
            </a>
            <a
              href={`${mainAppUrl}/legal/mentions-legales`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {t`Mentions légales`}
            </a>
            <a
              href={`${mainAppUrl}/legal/politique-confidentialite`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {t`Confidentialité`}
            </a>
            <a
              href={`${mainAppUrl}/legal/politique-cookies`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {t`Cookies`}
            </a>
          </nav>
          <p className="mt-4">
            © {new Date().getFullYear()} {name}. {t`Propulsé par qoefi`}
          </p>
        </footer>
      </div>
    </>
  );

  return (
    <TenantReaderShell
      style={customStyle}
      themeMode={themeMode}
      showProgressBar={false}
      disableFontOverride={true}
      articleMetadata={{
        title: article.title,
        coverUrl: article.imageUrl || publication.headerImageUrl || article.author?.logoUrl,
        authorName,
        contentSelector: '#article-content',
      }}
    >
      <JsonLd data={breadcrumbJsonLd ? [jsonLdData, breadcrumbJsonLd] : jsonLdData} />

      <MinimalCraftShell
        publication={templatePublication}
        article={templateArticle}
        articles={drawerArticles}
        style={customStyle}
      >
        {articleBodyContent}
      </MinimalCraftShell>

      {/* Barre d'actions globale du lecteur (Audio TTS, typographie, signets, follow créateur) */}
      <ReaderActions
        articleId={article.id}
        publicationId={publication.id}
        creatorName={authorName || t`le créateur`}
        isAuthenticated={!!user}
        initialBookmarked={initialBookmarked}
        initialFollowed={initialFollowed}
        mainAppUrl={mainAppUrl}
        articleTitle={article.title}
      />
    </TenantReaderShell>
  );
}
