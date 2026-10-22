import React from 'react';
import { JsonLd, buildWebSiteSchema } from '@qoe/ui';
import {
  TemplateRenderer,
  parseSiteLayouts,
  type TemplatePublicationContext,
  type TemplateArticleItem,
} from '@qoe/ui/templates';
import { RecommendedSection } from '@/components/RecommendedSection';
import { buildPublicDescription, sliceContentAtPaywall } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
import type { TenantPublication, RecommendationItem } from '@/lib/tenant-data';
import {
  TenantArticleRenderer,
  type TenantArticleRendererProps,
} from '@/app/tenant/[domain]/article/[slug]/TenantArticleRenderer';

export interface TenantHomeRendererProps {
  scope: 'home';
  publication: TenantPublication;
  recommendations?: RecommendationItem[] | null;
  decodedDomain: string;
  activeCategory?: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    parentId?: string | null;
  } | null;
  filteredArticles?: import('@/lib/tenant-data').TenantArticleSummary[];
}

export type TenantPageRendererProps =
  TenantHomeRendererProps | (TenantArticleRendererProps & { scope: 'article' });

/**
 * Contrôleur universel Server Component pour le rendu des pages de publication
 * (Home & Article). Assure une parité stricte avec le Theme Registry, l'isolation
 * des Server Components et la protection paywall zéro-fuite.
 */
export async function TenantPageRenderer(props: TenantPageRendererProps) {
  if (props.scope === 'article') {
    return <TenantArticleRenderer {...props} />;
  }

  const { publication, recommendations, decodedDomain } = props;
  const activeCategory = 'activeCategory' in props ? props.activeCategory : null;
  const filteredArticles = 'filteredArticles' in props ? props.filteredArticles : null;
  const {
    name,
    heroText,
    accentColor,
    fontFamily,
    logoUrl,
    articles = [],
    headerImageUrl,
    footerText,
    layoutStyle,
    themeMode,
    navigation = [],
    socialLinks = [],
    stripeAccountId,
    supportUrl,
  } = publication;

  const effectiveArticles = filteredArticles ?? articles;

  // 🔒 Zéro-fuite : les extraits des cartes sont dérivés du contenu DÉJÀ tronqué
  // par le paywall. Rendre `article.content` brut exposait le passage réservé
  // aux visiteurs non authentifiés (et aux crawlers) dès la page d'accueil.
  const articleExcerpts = new Map(
    effectiveArticles.map((article) => {
      const cut = sliceContentAtPaywall(
        article.content || '',
        { isMember: false, isPaidSubscriber: false },
        article.isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC
      );
      return [article.id, buildPublicDescription(cut.content, 250) ?? ''];
    })
  );

  const jsonLdData = buildWebSiteSchema({
    name: name || decodedDomain,
    url: `https://${decodedDomain}`,
    description: heroText || undefined,
  });

  const siteLayouts = parseSiteLayouts(layoutStyle, {
    accentColor,
    fontFamily,
  });

  const templatePub: TemplatePublicationContext = {
    id: publication.id,
    name,
    slug: publication.slug,
    domain: decodedDomain,
    subdomain: publication.subdomain,
    customDomain: publication.customDomain,
    logoUrl,
    heroText,
    headerImageUrl,
    footerText,
    accentColor,
    fontFamily,
    themeMode,
    stripeAccountId,
    supportUrl,
    categories: (publication.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
      parentId: c.parentId ?? null,
    })),
    activeCategory: activeCategory
      ? {
          id: activeCategory.id,
          name: activeCategory.name,
          slug: activeCategory.slug,
          description: activeCategory.description ?? null,
          parentId: activeCategory.parentId ?? null,
        }
      : null,
    siteOptions:
      (
        publication as {
          siteOptions?: Record<string, unknown> | null;
          site_options?: Record<string, unknown> | null;
        }
      ).siteOptions ??
      (
        publication as {
          siteOptions?: Record<string, unknown> | null;
          site_options?: Record<string, unknown> | null;
        }
      ).site_options ??
      null,
    navigation: navigation.map((n) => ({
      id: n.id,
      label: n.label,
      url: n.url,
      order: n.order,
      isExternal: n.isExternal,
      publicationId: publication.id,
      parentId: n.parentId,
    })),
    socialLinks: socialLinks.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      order: s.order,
      publicationId: publication.id,
    })),
    recommendations: recommendations ?? null,
    author: {
      name: publication.name,
      username: publication.user?.username ?? publication.subdomain ?? null,
      avatarUrl: publication.logoUrl,
      bio: publication.heroText ?? publication.bio ?? null,
    },
  };

  const rawSiteOpts = (publication.siteOptions ??
    (publication as unknown as { site_options?: Record<string, unknown> | null }).site_options ??
    {}) as Record<string, unknown>;
  const pinnedArticleId = rawSiteOpts?.pinnedArticleId as string | undefined;

  const templateArticles: TemplateArticleItem[] = effectiveArticles.map((article) => {
    const artAny = article as unknown as { isPinned?: boolean; isEditorPick?: boolean };
    const isPinned = Boolean(
      artAny.isPinned || artAny.isEditorPick || (pinnedArticleId && article.id === pinnedArticleId)
    );
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      imageUrl: article.imageUrl || null,
      excerpt: articleExcerpts.get(article.id) || '',
      readingTime: article.readingTime,
      isPremium: article.isPremium,
      isPinned,
      isEditorPick: Boolean(artAny.isEditorPick),
      likesCount: article.likesCount ?? 0,
      commentsCount: article.commentsCount ?? 0,
      repostsCount: article.repostsCount ?? 0,
      isLiked: Boolean(article.isLiked),
      isReposted: Boolean(article.isReposted),
      publishedAt: article.createdAt,
      category: article.category
        ? { name: article.category.name, slug: article.category.slug }
        : null,
    };
  });

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white">
      <JsonLd data={jsonLdData} />
      <TemplateRenderer
        config={siteLayouts.home}
        publication={templatePub}
        articles={templateArticles}
        mode="live"
      />
      {recommendations &&
        recommendations.length > 0 &&
        (rawSiteOpts?.showRecommendationsOnHome ?? true) !== false && (
          <div className="container mx-auto px-4 lg:px-8 py-12 border-t border-border">
            <RecommendedSection authorName={name} recommendations={recommendations} />
          </div>
        )}
    </div>
  );
}
