// =====================================================================
// 🎭 Server Component — apps/studio/src/app/(creator)/settings/design/page.tsx
// =====================================================================
// Route dédiée plein écran pour Qoefi Stage (Atelier Visuel Souverain).
// Charge la publication active et injecte les données dans StageClient.
// =====================================================================

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { StageClient } from '@/features/stage/StageClient';
import { Logo } from '@qoe/ui';
import { logout } from '@/app/login/actions';
import type { SidebarProps } from '@qoe/ui/sidebar';
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
    publicationLogoUrl: string | null;
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

  // 2. Récupération des informations pour le Sidebar Drawer
  let activeMediaId: string | null = null;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('qoe_active_workspace')?.value ?? null;
    if (raw) {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed?.type === 'MEDIA' && parsed.id) activeMediaId = parsed.id;
    }
  } catch {
    // aucun cookie
  }

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
    dbUser?.publicationLogoUrl ||
    (authUser.user_metadata?.avatar_url as string | undefined) ||
    null;

  const sidebarProps: SidebarProps = {
    items: [
      { title: 'Home', url: '/', iconName: 'Home' },
      { title: 'Articles', url: '/articles', iconName: 'FileText' },
      {
        title: 'Notifications',
        url: '/notifications',
        iconName: 'Bell',
        badge: unreadCount > 0 ? unreadCount : undefined,
      },
      { title: 'Médias', url: '/media', iconName: 'Building2' },
      { title: 'Newsletters', url: '/newsletters', iconName: 'Mail' },
      { title: 'Audience', url: '/audience', iconName: 'Users' },
      { title: 'Analytics', url: '/analytics', iconName: 'PieChart' },
      { title: 'Développeur / API', url: '/developer', iconName: 'Code' },
      { title: 'Webhooks', url: '/developer/webhooks', iconName: 'Webhook' },
      { title: 'Site Web', url: '/settings', iconName: 'Settings' },
      { title: 'Offre Pro', url: '/pricing', iconName: 'Crown' },
      { title: 'Importation', url: '/import', iconName: 'Upload' },
    ],
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

  // 3. Mapper vers TemplatePublicationContext
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
    categories: (publication.categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    })),
    subscriberCount: 380,
  };

  const templateArticles: TemplateArticleItem[] = publication.articles.map((art) => ({
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
      `/v1/settings/site-layout?publicationId=${encodeURIComponent(publication.id)}`
    );
    if (draft?.layout) initialDraft = draft.layout;
  } catch {
    initialDraft = null;
  }

  return (
    <StageClient
      publication={templatePub}
      articles={templateArticles}
      sidebarProps={sidebarProps}
      initialDraft={initialDraft}
    />
  );
}
