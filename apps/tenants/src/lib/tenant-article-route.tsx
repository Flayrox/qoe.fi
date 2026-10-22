import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getLanguage } from '@qoe/i18n/server';
import { buildBreadcrumbSchema } from '@qoe/ui';
import type { AnnotationItem, HighlightItem } from '@qoe/ui/annotations';
import { buildArticlePath, buildCategoryPath, buildPublicExcerpt } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
import { t } from '@lingui/core/macro';
import { fetchTenantArticle, fetchArticleHighlights } from '@/lib/tenant-data';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import { getArticleCommentsAction } from '@/app/tenant/[domain]/article/[slug]/actions';
import type { CommentItem } from '@/app/tenant/[domain]/article/[slug]/ArticleCommentsSection';

export interface TenantArticleRouteParams {
  domain: string;
  categorySlug: string;
  subCategorySlug?: string;
  articleSlug: string;
}

function requestedArticlePath(params: TenantArticleRouteParams): string {
  const segments = [params.categorySlug, params.subCategorySlug, params.articleSlug]
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => decodeURIComponent(segment));
  return `/${segments.join('/')}`;
}

export async function generateTenantArticleMetadata(
  params: TenantArticleRouteParams
): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const decodedDomain = decodeURIComponent(params.domain).toLowerCase();
  const decodedArticleSlug = decodeURIComponent(params.articleSlug);
  const bundle = await fetchTenantArticle(decodedDomain, decodedArticleSlug);
  if (!bundle) return {};

  const { publication, article } = bundle;
  const siteName = publication.name || decodedDomain;
  const defaultDesc = isFr
    ? `Lisez ${article.title} sur ${siteName}.`
    : `Read ${article.title} on ${siteName}.`;

  // 🔒 Zéro-fuite : la description auto est dérivée du teaser public.
  const autoDescription =
    buildPublicExcerpt(
      article.content || '',
      article.isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
      null,
      160
    ) || defaultDesc;
  const description = article.seoDescription?.trim() || autoDescription;
  const title = article.seoTitle?.trim() || `${article.title} | ${siteName}`;
  const canonicalUrl = `https://${decodedDomain}${buildArticlePath(article, publication.categories)}`;
  const authorName =
    article.author?.name || article.author?.username || siteName || (isFr ? 'Auteur' : 'Author');
  const coverImage =
    article.imageUrl || publication.headerImageUrl || article.author?.logoUrl || undefined;

  return {
    title,
    description,
    robots: {
      index: publication.allowIndexing !== false,
      follow: publication.allowIndexing !== false,
    },
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'article',
      locale: isFr ? 'fr_FR' : 'en_US',
      title,
      description,
      url: canonicalUrl,
      publishedTime: article.createdAt,
      authors: [authorName],
      images: coverImage ? [{ url: coverImage }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: coverImage ? [coverImage] : [],
    },
  };
}

export async function TenantArticleRoute(params: TenantArticleRouteParams) {
  const decodedDomain = decodeURIComponent(params.domain).toLowerCase();
  const decodedArticleSlug = decodeURIComponent(params.articleSlug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const bundle = await fetchTenantArticle(decodedDomain, decodedArticleSlug);
  if (!bundle) notFound();

  const { publication, article } = bundle;
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

  // URL canonique hiérarchique : redirection permanente si le chemin demandé
  // ne correspond pas à la catégorie/sous-catégorie réelle de l'article.
  const canonicalPath = buildArticlePath(article, publication.categories);
  if (requestedArticlePath(params) !== canonicalPath) {
    permanentRedirect(canonicalPath);
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

  const [hlRes, commentsRes] = await Promise.all([
    fetchArticleHighlights(article.id),
    getArticleCommentsAction(article.id),
  ]);

  const initialHighlights: HighlightItem[] = hlRes.myPrivateHighlights;
  const publicHighlights: AnnotationItem[] = hlRes.publicHighlights;
  const initialComments = (commentsRes?.comments || []) as unknown as CommentItem[];

  const breadcrumbJsonLd = buildBreadcrumbSchema([
    { name: publication.name || decodedDomain, url: `https://${decodedDomain}` },
    ...(article.category
      ? [
          {
            name: article.category.name,
            url: `https://${decodedDomain}${buildCategoryPath(
              article.category,
              publication.categories
            )}`,
          },
        ]
      : []),
    {
      name: article.title,
      url: `https://${decodedDomain}${canonicalPath}`,
    },
  ]);

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
      breadcrumbJsonLd={breadcrumbJsonLd}
    />
  );
}
