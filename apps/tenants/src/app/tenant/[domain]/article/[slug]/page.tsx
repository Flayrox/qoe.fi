import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { getMainAppUrl } from '@qoe/config';
import Link from 'next/link';
import Image from 'next/image';
import { TenantHeader, SubscribeForm } from '@qoe/ui';
import { type AnnotationItem, type HighlightItem } from '@qoe/ui/annotations';
import { TenantArticleHighlighter } from './TenantArticleHighlighter';
import { TenantArticleReadingTracker } from './TenantArticleReadingTracker';
import { type CommentItem } from './ArticleCommentsSection';
import { PaywallCut } from './PaywallCut';
import { ReaderActions } from './ReaderActions';
import { ArticleCommentsSection } from './ArticleCommentsSection';
import { getArticleCommentsAction } from './actions';
import { sliceContentAtPaywall } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
import { t } from '@lingui/core/macro';
import { fetchTenantArticle, fetchArticleHighlights } from '@/lib/tenant-data';
interface TenantArticlePageProps {
  params: Promise<{
    domain: string;
    slug: string;
  }>;
}

export default async function TenantArticlePage({ params }: TenantArticlePageProps) {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain).toLowerCase();
  const decodedSlug = decodeURIComponent(slug);

  // 1. Fetch current authenticated user (if any)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2+3. Go-first : GET /v1/publications/by-domain/{domain}/article/{slug} —
  // résolution polymorphe de la Publication + article (catégorie, auteur,
  // entitlements, bookmarked/followed) + fallback attribution côté Go.
  const bundle = await fetchTenantArticle(decodedDomain, decodedSlug);

  if (!bundle) {
    notFound();
  }

  const publication = bundle.publication;
  const article = bundle.article;
  const displayName = publication.name || publication.user?.username || t`le créateur`;
  const currentUserProfile: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  } | null = user
    ? {
        id: user.id,
        name: (user.user_metadata?.name as string) ?? null,
        username:
          (user.user_metadata?.username as string) ??
          (user.user_metadata?.user_name as string) ??
          null,
        logoUrl: (user.user_metadata?.avatar_url as string) ?? null,
      }
    : null;

  if (!article) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
          {t`404 • Écrit introuvable`}
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">
          {t`Cet écrit n'existe pas`}
        </h1>
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

  const isPublicationOwner =
    publication.type === 'MEDIA'
      ? false // Un article média est géré par les membres ; le brouillon n'est pas public
      : publication.user?.id === user?.id;

  // Si article non publié et visiteur ≠ propriétaire/membre du média
  if (!article.published && !isPublicationOwner && user?.id !== article.authorId) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-highlight/10 text-highlight border border-highlight/20 flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-highlight/10 text-highlight border border-highlight/20 text-xs font-bold uppercase tracking-wider mb-3">
          {t`Écrit Privé • Brouillon en cours`}
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">
          {t`Cet écrit n'est pas encore publié`}
        </h1>
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

  // 4. Interactions + surlignages + commentaires — Go-first.
  // bookmarked/followed viennent du bundle ; les surlignages publics + les
  // siens via GET /v1/articles/{id}/highlights ; commentaires via l'action Go.
  const initialBookmarked = bundle.bookmarked;
  const initialFollowed = bundle.followed;
  const [hlRes, commentsRes] = await Promise.all([
    fetchArticleHighlights(article.id),
    getArticleCommentsAction(article.id),
  ]);

  const initialHighlights: HighlightItem[] = hlRes.myPrivateHighlights;
  const publicHighlights: AnnotationItem[] = hlRes.publicHighlights;

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

  // 4. Paywall entitlements (résolus côté Go dans le bundle) & truncation
  // serveur sans fuite.
  const isAuthor = user?.id === article.authorId;
  const isPaidSubscriber = isAuthor || bundle.entitlements.isPaidSubscriber;
  const isMember = isAuthor || bundle.entitlements.isMember;

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
      {/* Header */}
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

      {/* Article Main Container */}
      <TenantArticleReadingTracker
        articleId={article.id}
        slug={article.slug}
        readingTimeMinutes={readingTimeMinutes}
        initialSource="subdomain"
      />
      <main className="container mx-auto px-4 lg:px-8 pt-12 pb-24 max-w-3xl">
        {/* Category & Metadata Header */}
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

        {/* Article Body Container with Server-side Zero-Leak PaywallCut */}
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

        {/* Interactive Genius Text Selection Highlighter & Side Drawer Engine */}
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

        {/* Article Comments & Nested Replies Section */}
        <ArticleCommentsSection
          articleId={article.id}
          initialComments={initialComments}
          isAuthenticated={!!user}
          currentUserId={user?.id || null}
          allowComments={allowComments}
          mainAppUrl={mainAppUrl}
          isBrutalist={isBrutalist}
        />

        {/* End of Article Subscribe Section */}
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
            <SubscribeForm publicationId={publication.id} isBrutalist={isBrutalist} />
          </div>
        </section>
      </main>

      {/* Floating Bottom Action Bar */}
      <ReaderActions
        articleId={article.id}
        publicationId={publication.id}
        creatorName={authorName || t`le créateur`}
        isAuthenticated={!!user}
        initialBookmarked={initialBookmarked}
        initialFollowed={initialFollowed}
        mainAppUrl={mainAppUrl}
      />

      {/* Footer */}
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
