// =====================================================================
// 🎨 Server Component — apps/studio/src/app/(creator)/settings/design/page.tsx
// =====================================================================
// Route dédiée plein écran pour l'Atelier Design Figma-Style.
// Charge la publication active et injecte les données dans FigmaStudioClient.
// =====================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { FigmaStudioClient } from '@/features/settings/components/figma/FigmaStudioClient';
import type { TemplatePublicationContext, TemplateArticleItem } from '@qoe/ui/templates';

interface SettingsPublicationDTO {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  themeMode: string | null;
  layoutStyle: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  footerText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  allowIndexing: boolean;
  supportUrl: string | null;
  navigation: {
    id: string;
    label: string;
    url: string | null;
    order: number;
    isExternal: boolean;
    parentId?: string | null;
  }[];
  socialLinks: { id: string; platform: string; url: string; order: number }[];
  articles: {
    id: string;
    title: string;
    slug: string;
    content: string;
    published: boolean;
    isPremium: boolean;
    categoryId: string | null;
    createdAt: string;
  }[];
  categories: { id: string; name: string; slug: string }[];
}

export default async function SettingsDesignPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const workspace = await getActiveWorkspace(user.id);

  let publication: SettingsPublicationDTO | null = null;
  try {
    publication = await goFetch<SettingsPublicationDTO>(
      `/v1/settings/publication?publicationId=${encodeURIComponent(workspace.publicationId)}`
    );
  } catch {
    publication = null;
  }

  if (!publication) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 bg-background text-center">
        <h2 className="text-xl font-bold text-destructive">Site web introuvable</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Impossible de charger les paramètres de mise en page.
        </p>
      </div>
    );
  }

  // Mapper vers TemplatePublicationContext
  const domain =
    publication.customDomain ||
    (publication.subdomain ? `${publication.subdomain}.qoe.fi` : 'nom.qoe.fi');
  const templatePub: TemplatePublicationContext = {
    id: publication.id,
    name: publication.name,
    slug: publication.slug,
    domain,
    subdomain: publication.subdomain,
    customDomain: publication.customDomain,
    logoUrl: publication.logoUrl,
    heroText: publication.heroText,
    headerImageUrl: publication.headerImageUrl,
    footerText: publication.footerText,
    accentColor: publication.accentColor,
    fontFamily: publication.fontFamily,
    themeMode: publication.themeMode,
    supportUrl: publication.supportUrl,
    navigation: publication.navigation.map((n) => ({
      id: n.id,
      label: n.label,
      url: n.url,
      order: n.order,
      isExternal: n.isExternal,
      publicationId: publication.id,
      parentId: n.parentId || null,
    })),
    socialLinks: publication.socialLinks.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      order: s.order,
      publicationId: publication.id,
    })),
    subscriberCount: 380,
  };

  const templateArticles: TemplateArticleItem[] = publication.articles.map((art) => ({
    id: art.id,
    title: art.title,
    slug: art.slug,
    content: art.content,
    excerpt: art.content ? art.content.slice(0, 160) : undefined,
    publishedAt: art.createdAt,
    readingTime: Math.max(1, Math.round((art.content?.split(' ').length || 200) / 200)),
    isPremium: art.isPremium,
  }));

  return <FigmaStudioClient publication={templatePub} articles={templateArticles} />;
}
