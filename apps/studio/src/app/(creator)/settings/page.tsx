// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/settings/page.tsx
// =====================================================================
// Page de configuration : opère sur la publication ACTIVE (personnelle OU
// média sélectionné via le switcher). Initialise le QOE Studio.
// =====================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { buttonClasses } from '@qoe/ui/button';
import { getActiveWorkspace } from '@/lib/active-workspace';
import SettingsView from '@/features/settings/settings';
import type { CreatorProfile } from '@/features/settings/types';
import { StudioPage, StudioSection } from '@/components/studio-page';

// Contrat Go GET /v1/settings/publication — mêmes champs JSON que le include
// Prisma d'origine (le mapping vers CreatorProfile ci-dessous est inchangé).
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
  siteOptions?: Record<string, unknown> | null;
  navigation: {
    id: string;
    label: string;
    url: string | null;
    order: number;
    isExternal: boolean;
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
    seoTitle: string | null;
    seoDescription: string | null;
    createdAt: string;
  }[];
  categories: { id: string; name: string; slug: string; parentId?: string | null }[];
  user: {
    id: string;
    email: string | null;
    username: string | null;
    advancedSettingsMode: boolean;
  } | null;
}

/**
 * 🚀 Go-first : GET /v1/settings/publication (même shape que le include Prisma).
 */
async function fetchSettingsGo(publicationId: string): Promise<SettingsPublicationDTO> {
  return goFetch<SettingsPublicationDTO>(
    `/v1/settings/publication?publicationId=${encodeURIComponent(publicationId)}`
  );
}

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

  // 3. Chargement de la publication active avec ses relations — Go.
  let publication: SettingsPublicationDTO | null = null;
  try {
    publication = await fetchSettingsGo(workspace.publicationId);
  } catch {
    publication = null;
  }

  if (!publication) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-12 text-center">
        <h2 className="text-lg font-semibold text-destructive-text">Publication introuvable</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contactez le support si l&apos;erreur persiste.
        </p>
      </div>
    );
  }

  const owner = publication.user;
  const isMedia = workspace.type === 'MEDIA';

  // Date du DTO Go = string ISO ; fallback Prisma = Date.
  const toIso = (d: string | Date) => (typeof d === 'string' ? d : d.toISOString());

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
    layoutStyle: 'minimal',
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
      createdAt: toIso(article.createdAt),
    })),
    categories: publication.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId ?? null,
    })),
    siteOptions: publication.siteOptions ?? null,
    advancedSettingsMode: owner?.advancedSettingsMode ?? false,
    isMedia,
    mediaRole: isMedia ? workspace.mediaRole : undefined,
  };

  return (
    <StudioPage className="space-y-10">
      <SettingsView initialCreator={initialCreatorData} publicationId={publication.id} />

      <StudioSection title="Compte">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Le mot de passe, l&apos;adresse e-mail, la double authentification et les sessions
            actives se gèrent depuis les paramètres du compte personnel.
          </p>
          <a
            href="https://qoe.fi/settings"
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            Gérer mon compte
          </a>
        </div>
      </StudioSection>
    </StudioPage>
  );
}
