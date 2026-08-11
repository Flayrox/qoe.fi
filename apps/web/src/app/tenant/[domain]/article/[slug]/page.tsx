import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { getMainAppUrl } from '@qoe/config';
import Link from 'next/link';
import { TenantHeader, SubscribeForm, SocialIcon } from '@qoe/ui';
import { PaywallCut } from './PaywallCut';
import { TextHighlighter } from './TextHighlighter';
import { ReaderActions } from './ReaderActions';
import { ArticleCommentsSection } from './ArticleCommentsSection';
import { getArticleCommentsAction } from '@qoe/api-client/actions/articles';


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
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserProfile = user ? await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, username: true, logoUrl: true }
  }) : null;

  // 2. Resolve creator by subdomain or custom domain (case-insensitive)
  const creator = await (prisma as any).user.findFirst({
    where: {
      OR: [
        { subdomain: { equals: decodedDomain, mode: "insensitive" } },
        { customDomain: { equals: decodedDomain, mode: "insensitive" } },
      ],
    },
    include: {
      navigation: { orderBy: { order: "asc" } },
      socialLinks: { orderBy: { order: "asc" } },
    },
  });

  if (!creator) {
    notFound();
  }

  // 3. Fetch article by slug or id and authorId
  const article = await (prisma as any).article.findFirst({
    where: {
      authorId: creator.id,
      OR: [
        { slug: { equals: decodedSlug, mode: "insensitive" } },
        { id: decodedSlug },
      ],
    },
    include: {
      category: true,
    },
  });

  if (!article) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
          404 • Écrit introuvable
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Cet écrit n'existe pas</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          Le lien que vous avez suivi est incorrect ou l'écrit a été retiré par <strong className="text-foreground">{creator.name || creator.username}</strong>.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-opacity shadow-sm"
        >
          Retourner au blog de {creator.name || creator.username}
        </Link>
      </div>
    );
  }

  // If article is unpublished draft and visitor is NOT the creator
  if (!article.published && user?.id !== article.authorId) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans select-none">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-black text-xl mb-4 shadow-sm">
          qoe
        </div>
        <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold uppercase tracking-wider mb-3">
          Écrit Privé • Brouillon en cours
        </span>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Cet écrit n'est pas encore publié</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          <strong className="text-foreground">{creator.name || creator.username}</strong> peaufine actuellement cet écrit. Il sera disponible en lecture dès sa publication officielle.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-opacity shadow-sm"
        >
          Explorer le blog de {creator.name || creator.username}
        </Link>
      </div>
    );
  }

  // 4. Fetch initial reader interactions, comments, and Genius public/official highlights
  let initialBookmarked = false;
  let initialFollowed = false;
  let initialHighlights: any[] = [];
  let publicHighlights: any[] = [];

  const [bm, fl, hl, publicHl, commentsRes] = await Promise.all([
    user ? prisma.bookmark.findUnique({
      where: {
        readerId_articleId: {
          readerId: user.id,
          articleId: article.id,
        },
      },
    }) : null,
    user ? prisma.follows.findUnique({
      where: {
        readerId_creatorId: {
          readerId: user.id,
          creatorId: creator.id,
        },
      },
    }) : null,
    user ? (prisma as any).highlight.findMany({
      where: {
        readerId: user.id,
        articleId: article.id,
        isPublic: false,
        isOfficial: false,
      },
      select: {
        id: true,
        text: true,
        note: true,
      },
    }) : [],
    (prisma as any).highlight.findMany({
      where: {
        articleId: article.id,
        OR: [
          { isOfficial: true },
          { isPublic: true }
        ]
      },
      include: {
        reader: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            subdomain: true,
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                username: true,
                logoUrl: true,
              }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    getArticleCommentsAction(article.id),
  ]);

  initialBookmarked = !!bm;
  initialFollowed = !!fl;
  initialHighlights = hl;
  publicHighlights = publicHl;

  const initialComments = commentsRes.ok && commentsRes.data ? commentsRes.data : [];


  const {
    name, heroText, accentColor, fontFamily, logoUrl,
    headerImageUrl, footerText, layoutStyle, themeMode,
    navigation, socialLinks, stripeAccountId, supportUrl
  } = creator;

  const allowPublicAnnotations = (creator.allowPublicAnnotations ?? true) && (article.allowPublicAnnotations ?? true);
  const allowComments = (creator.allowComments ?? true) && (article.allowComments ?? true);
  const mainAppUrl = getMainAppUrl(domain);
  const isBrutalist = layoutStyle === "brutalist";

  const customStyle = {
    "--tenant-accent": accentColor || "hsl(var(--primary))",
    fontFamily: fontFamily ? `var(--font-${fontFamily})` : "inherit",
    ...(themeMode === "dark" && { colorScheme: "dark" }),
  } as React.CSSProperties;

  const plainText = article.content.replace(/<[^>]*>?/gm, "");
  const wordCount = plainText.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      className={`min-h-screen ${themeMode === "dark" ? "dark bg-zinc-950 text-zinc-50" : "bg-background text-foreground"} selection:bg-[var(--tenant-accent)] selection:text-white transition-colors duration-300 relative`}
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
      <main className="container mx-auto px-4 lg:px-8 pt-12 pb-24 max-w-3xl">
        {/* Category & Metadata Header */}
        <header className="mb-10 space-y-4">
          <div className="flex items-center gap-3">
            {article.category && (
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${isBrutalist ? "border-2 border-foreground uppercase" : "bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]"}`}>
                {article.category.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground font-medium">
              {readingTimeMinutes} min de lecture
            </span>
          </div>

          <h1 className={`text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.15] ${isBrutalist ? "font-black uppercase" : "font-bold text-foreground"}`}>
            {article.title}
          </h1>

          <div className="flex items-center gap-3 pt-4 border-b border-border/40 pb-6 text-sm text-muted-foreground">
            {logoUrl && (
              <img src={logoUrl} alt={name || "Auteur"} className="w-10 h-10 rounded-full object-cover border border-border/40 shrink-0" />
            )}
            <div>
              <span className="font-semibold text-foreground">{name || creator.username}</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <time dateTime={article.createdAt.toISOString()}>
                  {new Date(article.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
            </div>
          </div>
        </header>

        {/* Article Body Container with TextHighlighter */}
        <div id="article-content" className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed space-y-6">
          <PaywallCut
            contentHtml={article.content}
            isPremium={article.isPremium}
            name={name || creator.username}
            isBrutalist={isBrutalist}
            accentColor={accentColor}
            mainAppUrl={mainAppUrl}
            creatorId={creator.id}
          />
        </div>

        {/* Interactive Genius Text Selection Highlighter & Side Drawer Engine */}
        <TextHighlighter
          articleId={article.id}
          creatorName={name || creator.username || "L'Auteur"}
          allowPublicAnnotations={allowPublicAnnotations}
          isAuthenticated={!!user}
          initialHighlights={initialHighlights}
          publicHighlights={publicHighlights}
          currentUserId={user?.id || null}
          currentUserProfile={currentUserProfile}
          articleAuthorId={article.authorId}
          mainAppUrl={mainAppUrl}
        />

        {/* Article Comments & Nested Replies Section */}
        <ArticleCommentsSection
          articleId={article.id}
          initialComments={initialComments as any}
          isAuthenticated={!!user}
          currentUserId={user?.id || null}
          allowComments={allowComments}
          mainAppUrl={mainAppUrl}
          isBrutalist={isBrutalist}
        />

        {/* End of Article Subscribe Section */}
        <section id="subscribe" className="mt-20 pt-12 border-t border-border/40">
          <div className={`p-8 md:p-12 text-center rounded-3xl ${isBrutalist ? "border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-card" : "bg-card border border-border/40 shadow-sm"}`}>
            <h3 className={`text-2xl md:text-3xl mb-3 ${isBrutalist ? "font-black uppercase" : "font-bold"}`}>
              Restez informé des prochaines publications
            </h3>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto mb-8">
              Abonnez-vous gratuitement à la newsletter de <strong className="text-foreground">{name}</strong> pour recevoir les prochains écrits directement dans votre boîte mail.
            </p>
            <SubscribeForm creatorId={creator.id} isBrutalist={isBrutalist} />
          </div>
        </section>
      </main>

      {/* Floating Bottom Action Bar */}
      <ReaderActions
        articleId={article.id}
        creatorId={creator.id}
        creatorName={name || creator.username || "le créateur"}
        isAuthenticated={!!user}
        initialBookmarked={initialBookmarked}
        initialFollowed={initialFollowed}
        mainAppUrl={mainAppUrl}
      />

      {/* Footer */}
      <footer className={`py-16 px-4 text-center ${isBrutalist ? "border-t-4 border-foreground" : "border-t border-border/40 bg-muted/20"}`}>
        <div className="max-w-2xl mx-auto space-y-6 text-sm text-muted-foreground">
          <p>{footerText || `© ${new Date().getFullYear()} ${name}. Propulsé par qoe.fi`}</p>
        </div>
      </footer>
    </div>
  );
}
