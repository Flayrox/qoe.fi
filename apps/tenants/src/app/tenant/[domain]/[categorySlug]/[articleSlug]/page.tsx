import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { getMainAppUrl } from '@qoe/config';
import Link from 'next/link';
import Image from 'next/image';
import { TenantHeader, SubscribeForm } from '@qoe/ui';
import { type AnnotationItem, type HighlightItem } from '@qoe/ui/annotations';
import { TenantArticleHighlighter } from '../../article/[slug]/TenantArticleHighlighter';
import { TenantArticleReadingTracker } from '../../article/[slug]/TenantArticleReadingTracker';
import { type CommentItem } from '../../article/[slug]/ArticleCommentsSection';
import { PaywallCut } from '../../article/[slug]/PaywallCut';
import { ReaderActions } from '../../article/[slug]/ReaderActions';
import { ArticleCommentsSection } from '../../article/[slug]/ArticleCommentsSection';
import { getArticleCommentsAction } from '../../article/[slug]/actions';
import { sliceContentAtPaywall } from '@qoe/utils';
import { ContentVisibility } from '@qoe/db/types';
import { t } from '@lingui/core/macro';

interface TenantCategoryArticlePageProps {
  params: Promise<{
    domain: string;
    categorySlug: string;
    articleSlug: string;
  }>;
}

export default async function TenantCategoryArticlePage({
  params,
}: TenantCategoryArticlePageProps) {
  const { domain, categorySlug, articleSlug } = await params;
  const decodedDomain = decodeURIComponent(domain).toLowerCase();
  const decodedCategorySlug = decodeURIComponent(categorySlug).toLowerCase();
  const decodedArticleSlug = decodeURIComponent(articleSlug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserProfile = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, username: true, logoUrl: true },
      })
    : null;

  const publication = await prisma.publication.findFirst({
    where: {
      OR: [
        { subdomain: { equals: decodedDomain, mode: 'insensitive' } },
        { customDomain: { equals: decodedDomain, mode: 'insensitive' } },
      ],
    },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
      user: { select: { id: true, username: true } },
    },
  });

  if (!publication) notFound();

  const displayName = publication.name || publication.user?.username || t`le créateur`;

  // 1) Try hosted article (publicationId + slug)
  let article = await prisma.article.findFirst({
    where: {
      publicationId: publication.id,
      OR: [
        { slug: { equals: decodedArticleSlug, mode: 'insensitive' } },
        { id: decodedArticleSlug },
      ],
    },
    include: {
      category: true,
      author: { select: { id: true, name: true, username: true, logoUrl: true } },
    },
  });

  let attributionCategorySlug: string | null = null;
  let isViaAttribution = false;

  // 2) Fallback: co-authored article via attribution (tenant owner is co-author)
  if (!article && publication.user?.id) {
    const coAuthored = await prisma.article.findFirst({
      where: {
        OR: [
          { slug: { equals: decodedArticleSlug, mode: 'insensitive' } },
          { id: decodedArticleSlug },
        ],
        attributions: {
          some: { userId: publication.user.id, consentStatus: 'ACCEPTED', isVisible: true },
        },
      },
      include: {
        category: true,
        author: { select: { id: true, name: true, username: true, logoUrl: true } },
        attributions: {
          where: { userId: publication.user.id },
          select: { categoryId: true, category: { select: { slug: true } } },
        },
      },
    });
    if (coAuthored) {
      article = {
        category: coAuthored.category,
        author: coAuthored.author,
      } as unknown as typeof coAuthored & { category: typeof coAuthored.category };
      // Preserve full article object for later
      const full = await prisma.article.findUnique({
        where: { id: coAuthored.id },
        include: {
          category: true,
          author: { select: { id: true, name: true, username: true, logoUrl: true } },
        },
      });
      if (full) {
        article = full;
        isViaAttribution = true;
        attributionCategorySlug = coAuthored.attributions[0]?.category?.slug || null;
      }
    }
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
          {t`404 • Écrit introuvable`}
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">{t`Cet écrit n'existe pas`}</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {t`Le lien que vous avez suivi est incorrect ou l'écrit a été retiré par `}
          <strong className="text-foreground">{displayName}</strong>.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-opacity shadow-sm"
        >
          {t`Retourner au blog de ${displayName}`}
        </Link>
      </div>
    );
  }

  // Canonical category slug: attribution's category for co-author tenant, else article's canonical
  const canonicalCategorySlug = isViaAttribution
    ? attributionCategorySlug || article.category?.slug || null
    : article.category?.slug || null;

  // If URL category != canonical, redirect 301 to canonical (or /article fallback if no category)
  if (canonicalCategorySlug && decodedCategorySlug !== canonicalCategorySlug.toLowerCase()) {
    redirect(`/${canonicalCategorySlug}/${encodeURIComponent(article.slug)}`);
  }
  if (!canonicalCategorySlug && decodedCategorySlug !== 'article') {
    // Article has no category but URL used a category — redirect to /article
    // (keep legacy /article valid, but canonical is /article)
    // Only redirect if category exists in this publication (to avoid false positive for article slugs that equal a category name)
    const maybeCategory = await prisma.category.findFirst({
      where: {
        slug: { equals: decodedCategorySlug, mode: 'insensitive' },
        publicationId: publication.id,
      },
    });
    if (maybeCategory) {
      redirect(`/article/${encodeURIComponent(article.slug)}`);
    }
  }

  const isPublicationOwner =
    publication.type === 'MEDIA' ? false : publication.user?.id === user?.id;

  if (!article.published && !isPublicationOwner && user?.id !== article.authorId) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-highlight/10 text-highlight border border-highlight/20 flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-highlight/10 text-highlight border border-highlight/20 text-xs font-bold uppercase tracking-wider mb-3">
          {t`Écrit Privé • Brouillon en cours`}
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">{t`Cet écrit n'est pas encore publié`}</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          <strong className="text-foreground">{displayName}</strong>{' '}
          {t`peaufine actuellement cet écrit. Il sera disponible en lecture dès sa publication officielle.`}
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-opacity shadow-sm"
        >
          {t`Explorer le blog de ${displayName}`}
        </Link>
      </div>
    );
  }

  // Fetch interactions (same as /article/[slug] page)
  let initialBookmarked = false;
  let initialFollowed = false;
  let initialHighlights: HighlightItem[] = [];
  let publicHighlights: AnnotationItem[] = [];

  const [bm, fl, hl, publicHl, commentsRes] = await Promise.all([
    user
      ? prisma.bookmark.findUnique({
          where: { readerId_articleId: { readerId: user.id, articleId: article.id } },
        })
      : null,
    user
      ? prisma.follows.findUnique({
          where: { readerId_publicationId: { readerId: user.id, publicationId: publication.id } },
        })
      : null,
    user
      ? prisma.highlight.findMany({
          where: { readerId: user.id, articleId: article.id, isPublic: false, isOfficial: false },
          select: { id: true, text: true, note: true },
        })
      : [],
    prisma.highlight.findMany({
      where: { articleId: article.id, OR: [{ isOfficial: true }, { isPublic: true }] },
      include: {
        reader: { select: { id: true, name: true, username: true, logoUrl: true } },
        comments: {
          include: { author: { select: { id: true, name: true, username: true, logoUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getArticleCommentsAction(article.id),
  ]);

  initialBookmarked = !!bm;
  initialFollowed = !!fl;
  initialHighlights = hl;
  publicHighlights = publicHl;

  const initialComments = (commentsRes?.comments || []) as unknown as CommentItem[];

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
  const allowPublicAnnotations =
    (publication.allowPublicAnnotations ?? true) && (article.allowPublicAnnotations ?? true);
  const allowComments = (publication.allowComments ?? true) && (article.allowComments ?? true);
  const mainAppUrl = getMainAppUrl(domain);
  const isBrutalist = layoutStyle === 'brutalist';
  const isMediaBrand = publication.type === 'MEDIA';

  const customStyle = {
    '--tenant-accent': accentColor || 'hsl(var(--primary))',
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : 'inherit',
    ...(themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const plainText = article.content.replace(/<[^>]*>?/gm, '');
  const wordCount = plainText.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  // Paywall (same as /article page)
  const isAuthor = user?.id === article.authorId;
  let isPaidSubscriber = isAuthor;
  let isMember = isAuthor;
  if (user) {
    const subscriberRecord = await prisma.subscriber.findFirst({
      where: { publicationId: publication.id, email: user.email || '', isActive: true },
    });
    isPaidSubscriber = isAuthor || !!subscriberRecord?.isPremium;
    isMember = isPaidSubscriber || !!subscriberRecord;
  }
  const visibility = article.isPremium
    ? ContentVisibility.PAID_SUBSCRIBERS
    : ContentVisibility.PUBLIC;
  const paywallCutResult = sliceContentAtPaywall(
    article.content || '',
    { isMember, isPaidSubscriber },
    visibility
  );

  return (
    <div
      className={`min-h-screen ${themeMode === 'dark' ? 'dark bg-foreground text-background' : 'bg-background text-foreground'} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300 relative`}
      style={customStyle}
    >
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
      <TenantArticleReadingTracker
        articleId={article.id}
        slug={article.slug}
        readingTimeMinutes={readingTimeMinutes}
        initialSource="subdomain"
      />
      <main className="container mx-auto px-4 lg:px-8 pt-12 pb-24 max-w-3xl">
        <header className="mb-10 space-y-4">
          <div className="flex items-center gap-3">
            {article.category && (
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${isBrutalist ? 'border-2 border-foreground uppercase' : 'bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]'}`}
              >
                {article.category.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground font-medium">{t`${readingTimeMinutes} min de lecture`}</span>
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
                className={`w-10 h-10 object-cover border border-border/40 shrink-0 ${isMediaBrand ? 'rounded-lg' : 'rounded-full'}`}
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
                <time dateTime={article.createdAt.toISOString()}>
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
        />
        <ArticleCommentsSection
          articleId={article.id}
          initialComments={initialComments}
          isAuthenticated={!!user}
          currentUserId={user?.id || null}
          allowComments={allowComments}
          mainAppUrl={mainAppUrl}
          isBrutalist={isBrutalist}
        />
        <section id="subscribe" className="mt-20 pt-12 border-t border-border/40">
          <div
            className={`p-8 md:p-12 text-center rounded-3xl ${isBrutalist ? 'border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-card' : 'bg-card border border-border/40 shadow-sm'}`}
          >
            <h3
              className={`text-2xl md:text-3xl mb-3 ${isBrutalist ? 'font-black uppercase' : 'font-bold'}`}
            >{t`Restez informé des prochaines publications`}</h3>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto mb-8">
              {t`Abonnez-vous gratuitement à la newsletter de `}
              <strong className="text-foreground">{name}</strong>{' '}
              {t`pour recevoir les prochains écrits directement dans votre boîte mail.`}
            </p>
            <SubscribeForm publicationId={publication.id} isBrutalist={isBrutalist} />
          </div>
        </section>
      </main>
      <ReaderActions
        articleId={article.id}
        publicationId={publication.id}
        creatorName={authorName || t`le créateur`}
        isAuthenticated={!!user}
        initialBookmarked={initialBookmarked}
        initialFollowed={initialFollowed}
        mainAppUrl={mainAppUrl}
      />
      <footer
        className={`py-16 px-4 text-center ${isBrutalist ? 'border-t-4 border-foreground' : 'border-t border-border/40 bg-muted/20'}`}
      >
        <div className="max-w-2xl mx-auto space-y-6 text-sm text-muted-foreground">
          <p>{footerText || t`© ${new Date().getFullYear()} ${name ?? ''}. Propulsé par qoe.fi`}</p>
        </div>
      </footer>
    </div>
  );
}
