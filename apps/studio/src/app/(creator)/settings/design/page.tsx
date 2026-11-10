// =====================================================================
// 🎭 Server Component — apps/studio/src/app/(creator)/settings/design/page.tsx
// =====================================================================
// Route dédiée plein écran pour Qoefi Stage (Atelier Visuel Souverain).
// Charge la publication active et injecte les données dans StageClient.
// =====================================================================

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { StageClient } from '@/features/stage/StageClient';
import { Logo } from '@qoe/ui';
import { getSidebarSurfaces } from '@qoe/config';
import { logout } from '@/app/login/actions';
import type { SidebarProps } from '@qoe/ui/sidebar';
import type { TemplatePublisherContext, TemplateArticleItem } from '@qoe/ui/templates';

interface SettingsPublisherDTO {
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
    imageUrl?: string | null;
    published: boolean;
    isPremium: boolean;
    categoryId: string | null;
    createdAt: string;
  }[];
  categories: { id: string; name: string; slug: string }[];
}

interface MeResponse {
  data: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    logoUrl: string | null;
    publisherLogoUrl: string | null;
  };
}

interface WorkspacesResponse {
  medias: { id: string; name: string }[];
}

export default async function SettingsDesignPage() {
  // 🛡️ Stage est réservé au développement local (en cours de dev).
  // En production, la route renvoie 404 sauf si expressément activée via flag.
  const isDev = process.env.NODE_ENV === 'development';
  const isExplicitlyEnabled = process.env.ENABLE_STAGE_PROD === 'true';
  if (!isDev && !isExplicitlyEnabled) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) {
    redirect('/login');
  }

  const workspace = await getActiveWorkspace(authUser.id);

  // 1. Récupération de la publication
  let publisher: SettingsPublisherDTO | null = null;
  try {
    publisher = await goFetch<SettingsPublisherDTO>(
      `/v1/settings/publisher?publisherId=${encodeURIComponent(workspace.publisherId)}`
    );
  } catch {
    publisher = null;
  }

  if (!publisher) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-center">
        <h2 className="text-xl font-bold text-destructive-text">Site web introuvable</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Impossible de charger les paramètres de mise en page.
        </p>
      </div>
    );
  } // 2. Récupération des informations pour le Sidebar Drawer
  const activeMediaId = workspace.type === 'MEDIA' ? (workspace.mediaId ?? null) : null;

  let dbUser = null;
  let unreadCount = 0;
  let mediaBrandName: string | null = null;

  try {
    const [me, unread, workspaces] = await Promise.all([
      goFetch<MeResponse>('/v1/users/me').catch(() => null),
      goFetch<{ count: number }>('/v1/notifications/unread-count').catch(() => ({ count: 0 })),
      goFetch<WorkspacesResponse>('/v1/media/workspaces').catch(() => ({ medias: [] })),
    ]);

    if (me?.data) dbUser = me.data;
    if (unread?.count) unreadCount = unread.count;
    if (activeMediaId && workspaces?.medias) {
      mediaBrandName = workspaces.medias.find((m) => m.id === activeMediaId)?.name ?? null;
    }
  } catch {
    dbUser = null;
  }

  const userName =
    dbUser?.name ||
    dbUser?.username ||
    (authUser.user_metadata?.name as string | undefined) ||
    'Creator';
  const userEmail = dbUser?.email || authUser.email || 'hello@qoe.fi';
  const userAvatar =
    dbUser?.logoUrl ||
    dbUser?.publisherLogoUrl ||
    (authUser.user_metadata?.avatar_url as string | undefined) ||
    null;

  const sidebarProps: SidebarProps = {
    // Aperçu fidèle : la même source que la sidebar réelle (manifeste).
    items: getSidebarSurfaces('studio').map((surface) => ({
      title: surface.defaultLabel,
      url: surface.path,
      iconName: surface.iconName,
      badge: surface.id === 'studio.notifications' && unreadCount > 0 ? unreadCount : undefined,
    })),
    logo: <Logo className="h-5 w-auto" fillColor="#EE4B2B" />,
    brandName: mediaBrandName || 'Studio',
    userName,
    userEmail,
    userFallback: userName.slice(0, 2).toUpperCase(),
    userAvatar,
    onLogout: logout,
    primaryAction: {
      label: 'Nouvel Écrit',
      href: '/articles/new',
    },
  };

  // 3. Mapper vers TemplatePublisherContext
  const domain =
    publisher.customDomain ||
    (publisher.subdomain ? `${publisher.subdomain}.qoe.fi` : 'nom.qoe.fi');
  const templatePub: TemplatePublisherContext = {
    id: publisher.id,
    name: publisher.name,
    slug: publisher.slug,
    domain,
    subdomain: publisher.subdomain,
    customDomain: publisher.customDomain,
    logoUrl: publisher.logoUrl,
    heroText: publisher.heroText,
    headerImageUrl: publisher.headerImageUrl,
    footerText: publisher.footerText,
    accentColor: publisher.accentColor,
    fontFamily: publisher.fontFamily,
    themeMode: publisher.themeMode,
    supportUrl: publisher.supportUrl,
    navigation: publisher.navigation.map((n) => ({
      id: n.id,
      label: n.label,
      url: n.url,
      order: n.order,
      isExternal: n.isExternal,
      publisherId: publisher.id,
      parentId: n.parentId || null,
    })),
    socialLinks: publisher.socialLinks.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      order: s.order,
      publisherId: publisher.id,
    })),
    categories: (publisher.categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    })),
    subscriberCount: 380,
  };

  const templateArticles: TemplateArticleItem[] = publisher.articles.map((art) => ({
    id: art.id,
    title: art.title,
    slug: art.slug,
    content: art.content,
    imageUrl: art.imageUrl || null,
    excerpt: art.content ? art.content.slice(0, 160) : undefined,
    publishedAt: art.createdAt,
    readingTime: Math.max(1, Math.round((art.content?.split(' ').length || 200) / 200)),
    isPremium: art.isPremium,
  }));

  // 4. Injecter le layoutStyle existant + le brouillon éventuel.
  // Le brouillon prime : l'atelier reprend là où le créateur s'est arrêté.
  templatePub.layoutStyle = 'minimal';
  let initialDraft: string | null = null;
  try {
    const draft = await goFetch<{ layout?: string | null }>(
      `/v1/settings/site-layout?publisherId=${encodeURIComponent(publisher.id)}`
    );
    if (draft?.layout) initialDraft = draft.layout;
  } catch {
    initialDraft = null;
  }

  return (
    <StageClient
      publisher={templatePub}
      articles={templateArticles}
      sidebarProps={sidebarProps}
      initialDraft={initialDraft}
    />
  );
}
