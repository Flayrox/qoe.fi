// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/settings/page.tsx
// =====================================================================
// Page de configuration : opère sur la publication ACTIVE (personnelle OU
// média sélectionné via le switcher). Initialise le QOE Studio.
// =====================================================================

import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import VisualStudio, { CreatorProfile } from '@/features/settings/components/visual-studio';

export default async function CreatorSettingsPage() {
  // 1. Authentification de l'utilisateur
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  // 2. Workspace actif (publication personnelle OU média)
  const workspace = await getActiveWorkspace(user.id);

  // 3. Chargement de la publication active avec ses relations
  const publication = await prisma.publication.findUnique({
    where: { id: workspace.publicationId },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
      articles: { orderBy: { createdAt: 'desc' } },
      categories: { orderBy: { name: 'asc' } },
      user: { select: { id: true, email: true, username: true, advancedSettingsMode: true } },
    },
  });

  if (!publication) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-2xl bg-destructive/5 border-destructive/10">
        <h2 className="text-lg font-bold text-destructive">Publication introuvable</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Veuillez contacter le support si l'erreur persiste.
        </p>
      </div>
    );
  }

  const owner = publication.user;
  const isMedia = workspace.type === 'MEDIA';

  // 4. Mapping sécurisé vers un objet sérialisable
  const initialCreatorData: CreatorProfile = {
    id: workspace.type === 'MEDIA' ? workspace.mediaId || publication.id : owner?.id || user.id,
    email: owner?.email ?? user.email ?? '',
    username: owner?.username ?? null,
    name: publication.name,
    heroText: publication.heroText ?? null,
    accentColor: publication.accentColor ?? null,
    fontFamily: publication.fontFamily ?? null,
    themeMode: publication.themeMode || 'classic',
    layoutStyle: publication.layoutStyle || 'minimal',
    logoUrl: publication.logoUrl ?? null,
    headerImageUrl: publication.headerImageUrl ?? null,
    footerText: publication.footerText ?? null,
    seoTitle: publication.seoTitle ?? null,
    seoDescription: publication.seoDescription ?? null,
    allowIndexing: publication.allowIndexing ?? true,
    supportUrl: publication.supportUrl ?? null,
    subdomain: publication.subdomain ?? null,
    customDomain: publication.customDomain ?? null,
    navigation: publication.navigation.map((nav) => ({
      id: nav.id,
      label: nav.label,
      url: nav.url,
      order: nav.order,
      isExternal: nav.isExternal,
    })),
    socialLinks: publication.socialLinks.map((social) => ({
      id: social.id,
      platform: social.platform,
      url: social.url,
      order: social.order,
    })),
    articles: publication.articles.map((article) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      published: article.published,
      isPremium: article.isPremium,
      categoryId: article.categoryId,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      createdAt: article.createdAt.toISOString(),
    })),
    categories: publication.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    })),
    advancedSettingsMode: owner?.advancedSettingsMode ?? false,
    isMedia,
    mediaRole: isMedia ? workspace.mediaRole : undefined,
  };

  return <VisualStudio initialCreator={initialCreatorData} />;
}
