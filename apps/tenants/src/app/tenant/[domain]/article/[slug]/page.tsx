import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import Link from 'next/link';
import { getArticleCommentsAction } from './actions';
import { buildPublicExcerpt } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
import { t } from '@lingui/core/macro';
import { fetchTenantArticle, fetchArticleHighlights } from '@/lib/tenant-data';
import type { Metadata } from 'next';
import { getLanguage } from '@qoe/i18n/server';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import type { CommentItem } from './ArticleCommentsSection';
import type { AnnotationItem, HighlightItem } from '@qoe/ui/annotations';

interface TenantArticlePageProps {
  params: Promise<{
    domain: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: TenantArticlePageProps): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain).toLowerCase();
  const decodedSlug = decodeURIComponent(slug);

  const bundle = await fetchTenantArticle(decodedDomain, decodedSlug);
  if (!bundle) return {};

  const { publication, article } = bundle;
  const title = `${article.title} | ${publication.name || decodedDomain}`;
  const defaultDesc = isFr
    ? `Lisez ${article.title} sur ${publication.name || decodedDomain}.`
    : `Read ${article.title} on ${publication.name || decodedDomain}.`;

  // 🔒 Zéro-fuite : description SEO dérivée du teaser public
  const description =
    buildPublicExcerpt(
      article.content || '',
      article.isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
      null,
      160
    ) || defaultDesc;

  const canonicalUrl = `https://${decodedDomain}/article/${encodeURIComponent(article.slug)}`;
  const authorName =
    article.author?.name ||
    article.author?.username ||
    publication.name ||
    (isFr ? 'Auteur' : 'Author');
  const coverImage =
    article.imageUrl || publication.headerImageUrl || article.author?.logoUrl || undefined;

  return {
    title,
    description,
    robots: {
      index: publication.allowIndexing !== false,
      follow: publication.allowIndexing !== false,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'article',
      locale: isFr ? 'fr_FR' : 'en_US',
      title: article.title,
      description,
      url: canonicalUrl,
      publishedTime: article.createdAt,
      authors: [authorName],
      images: coverImage ? [{ url: coverImage }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      images: coverImage ? [coverImage] : [],
    },
  };
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

  // 2. Go-first : GET /v1/publications/by-domain/{domain}/article/{slug}
  const bundle = await fetchTenantArticle(decodedDomain, decodedSlug);

  if (!bundle) {
    notFound();
  }

  const publication = bundle.publication;
  const article = bundle.article;
  const displayName = publication.name || publication.user?.username || t`le créateur`;

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
    publication.type === 'MEDIA' ? false : publication.user?.id === user?.id;

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

  // 3. Fetch highlights & commentaires
  const [hlRes, commentsRes] = await Promise.all([
    fetchArticleHighlights(article.id),
    getArticleCommentsAction(article.id),
  ]);

  const initialHighlights: HighlightItem[] = hlRes.myPrivateHighlights;
  const publicHighlights: AnnotationItem[] = hlRes.publicHighlights;
  const initialComments = (commentsRes?.comments || []) as unknown as CommentItem[];

  return (
    <TenantPageRenderer
      scope="article"
      publication={publication}
      article={article}
      user={user}
      bundle={bundle}
      decodedDomain={decodedDomain}
      initialBookmarked={bundle.bookmarked}
      initialFollowed={bundle.followed}
      initialHighlights={initialHighlights}
      publicHighlights={publicHighlights}
      initialComments={initialComments}
    />
  );
}
