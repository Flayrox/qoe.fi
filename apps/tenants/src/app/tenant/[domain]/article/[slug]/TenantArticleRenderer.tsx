import React from 'react';
import Image from 'next/image';
import { TenantHeader, SubscribeForm, JsonLd, buildArticleSchema } from '@qoe/ui';
import { type AnnotationItem, type HighlightItem } from '@qoe/ui/annotations';
import { TenantArticleHighlighter } from './TenantArticleHighlighter';
import { TenantArticleReadingTracker } from './TenantArticleReadingTracker';
import { type CommentItem, ArticleCommentsSection } from './ArticleCommentsSection';
import { PaywallCut } from './PaywallCut';
import { ReaderActions } from './ReaderActions';
import { TenantReaderShell } from './TenantReaderShell';
import { RelatedArticles } from './RelatedArticles';
import { ReadingProgressBar } from '@/components/ReadingProgressBar';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import {
  TemplateRenderer,
  parseSiteLayouts,
  resolveTheme,
  MinimalCraftShell,
  getCoverPlaceholder,
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
  const {
    name,
    accentColor,
    fontFamily,
    logoUrl,
    footerText,
    layoutStyle,
    themeMode,
    navigation,
    socialLinks,
    stripeAccountId,
    supportUrl,
  } = publication;

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
  const mainAppUrl = getMainAppUrl(decodedDomain);
  const isBrutalist = layoutStyle === 'brutalist';
  const isMediaBrand = publication.type === 'MEDIA';

  const customStyle = {
    '--tenant-accent': accentColor || 'hsl(var(--primary))',
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : 'inherit',
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const plainText = (article.content || '').replace(/<[^>]*>?/gm, '');
  const wordCount = plainText.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

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

  // Résolution polymorphe du thème
  const siteLayouts = parseSiteLayouts(publication.layoutStyle || 'magazine');
  const theme = resolveTheme(publication.layoutStyle);
  const isMinimal = theme.id === 'minimal';

  const articleLayout =
    (article.category?.slug && siteLayouts.articleByCategory[article.category.slug]) ||
    siteLayouts.article ||
    null;

  const templatePublication: TemplatePublicationContext = {
    id: publication.id,
    name: publication.name,
    domain: decodedDomain,
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
  };

  const templateArticle: TemplateArticleItem = {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: paywallCutResult.content,
    excerpt: '',
    imageUrl: article.imageUrl || null,
    publishedAt: article.createdAt,
    readingTime: readingTimeMinutes,
    isPremium: false,
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
          <TemplateRenderer
            config={articleLayout}
            publication={templatePublication}
            articles={drawerArticles}
            article={templateArticle}
            standaloneShell={false}
            mode="live"
          />
        ) : (
          <>
            {isMinimal ? (
              /* En-tête épuré d'orfèvre Devouring Details / Rauno */
              <header className="mb-8 space-y-4">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground select-none">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: accentColor || '#F97316' }}
                    aria-hidden="true"
                  />
                  {authorName && (
                    <span className="font-semibold text-foreground/90">{authorName}</span>
                  )}
                  <span className="text-muted-foreground/40">·</span>
                  <time dateTime={article.createdAt}>
                    {new Date(article.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </time>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{readingTimeMinutes} min</span>
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-snug">
                  {article.title}
                </h1>

                {/* Couverture article : image réelle ou composition vectorielle déterministe */}
                {(() => {
                  const coverSrc =
                    article.imageUrl || getCoverPlaceholder(article.slug || article.id);
                  return (
                    <div className="mt-8 mb-8 -mx-4 sm:-mx-8 md:-mx-12">
                      <div className="relative aspect-[16/9] sm:aspect-[2/1] rounded-2xl overflow-hidden border border-border/40 bg-muted/30 shadow-2xs">
                        <img
                          src={coverSrc}
                          alt={article.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  );
                })()}
              </header>
            ) : (
              /* En-tête standard Magazine */
              <>
                <header className="mb-10 space-y-4">
                  <div className="flex items-center gap-3">
                    {article.category && (
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${isBrutalist ? 'border-2 border-foreground uppercase' : 'bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]'}`}
                      >
                        {article.category.name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-medium">
                      {t`${readingTimeMinutes} min de lecture`}
                    </span>
                  </div>

                  <h1
                    className={`text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.15] ${isBrutalist ? 'font-black uppercase' : 'font-bold text-foreground'}`}
                  >
                    {article.title}
                  </h1>

                  <div className="flex items-center gap-3 pt-4 border-b border-border/40 pb-6 text-sm text-muted-foreground">
                    {logoUrl && (
                      <Image
                        src={logoUrl}
                        alt={name || t`Auteur`}
                        width={40}
                        height={40}
                        className={`w-10 h-10 object-cover border border-border/40 shrink-0 ${
                          isMediaBrand ? 'rounded-lg' : 'rounded-full'
                        }`}
                      />
                    )}
                    <div>
                      <span className="font-semibold text-foreground">{authorName}</span>
                      {isMediaBrand && article.author?.name && (
                        <span className="ml-1.5 text-muted-foreground text-xs">
                          • {t`Par ${article.author.name}`}
                        </span>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <time dateTime={article.createdAt}>
                          {new Date(article.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </time>
                      </div>
                    </div>
                  </div>
                </header>

                {(() => {
                  const coverSrc =
                    article.imageUrl || getCoverPlaceholder(article.slug || article.id);
                  return (
                    <figure className="relative w-full overflow-hidden rounded-2xl border border-border/30">
                      <img
                        src={coverSrc}
                        alt={article.title}
                        className="h-auto w-full object-cover"
                      />
                    </figure>
                  );
                })()}
              </>
            )}

            {/* Corps de l'article avec coupure Paywall */}
            {!canonicalDocument && (
              <div
                id="article-content"
                className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6"
              >
                <PaywallCut
                  contentHtml={paywallCutResult.content}
                  isPremium={article.isPremium && !paywallCutResult.accessGranted}
                  name={authorName}
                  isBrutalist={isBrutalist}
                  accentColor={accentColor}
                  mainAppUrl={mainAppUrl}
                  creatorId={article.authorId}
                />
              </div>
            )}

            {/* Surligneur Genius et moteur de sélections (rendu avec le corps d'article) */}
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
          isBrutalist={isBrutalist}
        />

        {/* Section abonnement */}
        <section id="subscribe" className="mt-20 pt-12 border-t border-border/40">
          <div
            className={`p-8 md:p-12 text-center rounded-3xl ${isBrutalist ? 'border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-card' : 'bg-card border border-border/40 shadow-sm'}`}
          >
            <h3
              className={`text-2xl md:text-3xl mb-3 ${isBrutalist ? 'font-black uppercase' : 'font-bold'}`}
            >
              {t`Restez informé des prochaines publications`}
            </h3>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto mb-8">
              {t`Abonnez-vous gratuitement à la newsletter de `}
              <strong className="text-foreground">{name}</strong>{' '}
              {t`pour recevoir les prochains écrits directement dans votre boîte mail.`}
            </p>
            <SubscribeForm
              publicationId={publication.id}
              isBrutalist={isBrutalist}
              userEmail={user?.email || null}
              authorName={name}
            />
          </div>
        </section>
      </div>
    </>
  );

  return (
    <TenantReaderShell
      style={customStyle}
      themeMode={themeMode}
      showProgressBar={!isMinimal}
      articleMetadata={{
        title: article.title,
        coverUrl: article.imageUrl || publication.headerImageUrl || article.author?.logoUrl,
        authorName,
        contentSelector: '#article-content',
      }}
    >
      <JsonLd data={breadcrumbJsonLd ? [jsonLdData, breadcrumbJsonLd] : jsonLdData} />

      {isMinimal ? (
        <MinimalCraftShell
          publication={templatePublication}
          article={templateArticle}
          articles={drawerArticles}
        >
          {articleBodyContent}
        </MinimalCraftShell>
      ) : (
        <>
          <ReadingProgressBar />
          <TenantHeader
            name={name}
            domain={decodedDomain}
            logoUrl={logoUrl}
            layoutStyle={layoutStyle}
            stripeAccountId={stripeAccountId}
            supportUrl={supportUrl}
            navigation={navigation}
            socialLinks={socialLinks}
          />
          <main className="pt-12 pb-24">{articleBodyContent}</main>
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
          <footer
            className={`py-16 px-4 text-center ${isBrutalist ? 'border-t-4 border-foreground' : 'border-t border-border/40 bg-muted/20'}`}
          >
            <div className="max-w-2xl mx-auto space-y-6 text-sm text-muted-foreground">
              <LegalFooterLinks />
              <p>
                {footerText || t`© ${new Date().getFullYear()} ${name ?? ''}. Propulsé par qoefi`}
              </p>
            </div>
          </footer>
        </>
      )}
    </TenantReaderShell>
  );
}
