// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/settings/page.tsx
// =====================================================================
// Page de configuration : opère sur la publication ACTIVE (personnelle OU
// média sélectionné via le switcher). Initialise le QOE Studio.
// =====================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import SettingsView from '@/features/settings/settings';
import type { CreatorProfile } from '@/features/settings/types';
import { StudioPage, StudioSection } from '@/components/studio-page';
import { FeatureConsents } from '@/features/settings/components/feature-consents';
import { AccountLink } from './account-link';

// Contrat Go GET /v1/settings/publisher — mêmes champs JSON que le include
// Prisma d'origine (le mapping vers CreatorProfile ci-dessous est inchangé).
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
 * 🚀 Go-first : GET /v1/settings/publisher (même shape que le include Prisma).
 */
async function fetchSettingsGo(publisherId: string): Promise<SettingsPublisherDTO> {
  return goFetch<SettingsPublisherDTO>(
    `/v1/settings/publisher?publisherId=${encodeURIComponent(publisherId)}`
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
  let publisher: SettingsPublisherDTO | null = null;
  try {
    publisher = await fetchSettingsGo(workspace.publisherId);
  } catch {
    publisher = null;
  }

  if (!publisher) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-12 text-center">
        <h2 className="text-lg font-semibold text-destructive-text">Publisher introuvable</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contactez le support si l&apos;erreur persiste.
        </p>
      </div>
    );
  }

  const owner = publisher.user;
  const isMedia = workspace.type === 'MEDIA';

  // Date du DTO Go = string ISO ; fallback Prisma = Date.
  const toIso = (d: string | Date) => (typeof d === 'string' ? d : d.toISOString());

  // 4. Mapping sécurisé vers un objet sérialisable
  const initialCreatorData: CreatorProfile = {
    id: workspace.type === 'MEDIA' ? workspace.mediaId || publisher.id : owner?.id || user.id,
    email: owner?.email ?? user.email ?? '',
    username: owner?.username ?? null,
    name: publisher.name,
    heroText: publisher.heroText ?? null,
    accentColor: publisher.accentColor ?? null,
    fontFamily: publisher.fontFamily ?? null,
    themeMode: publisher.themeMode || 'classic',
    layoutStyle: 'minimal',
    logoUrl: publisher.logoUrl ?? null,
    headerImageUrl: publisher.headerImageUrl ?? null,
    footerText: publisher.footerText ?? null,
    seoTitle: publisher.seoTitle ?? null,
    seoDescription: publisher.seoDescription ?? null,
    allowIndexing: publisher.allowIndexing ?? true,
    supportUrl: publisher.supportUrl ?? null,
    subdomain: publisher.subdomain ?? null,
    customDomain: publisher.customDomain ?? null,
    navigation: publisher.navigation.map((nav) => ({
      id: nav.id,
      label: nav.label,
      url: nav.url,
      order: nav.order,
      isExternal: nav.isExternal,
    })),
    socialLinks: publisher.socialLinks.map((social) => ({
      id: social.id,
      platform: social.platform,
      url: social.url,
      order: social.order,
    })),
    articles: publisher.articles.map((article) => ({
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
    categories: publisher.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId ?? null,
    })),
    siteOptions: publisher.siteOptions ?? null,
    advancedSettingsMode: owner?.advancedSettingsMode ?? false,
    isMedia,
    mediaRole: isMedia ? workspace.mediaRole : undefined,
  };

  return (
    <StudioPage className="space-y-10">
      <SettingsView initialCreator={initialCreatorData} publisherId={publisher.id} />

      <StudioSection title="Notifications de lancement">
        <FeatureConsents />
      </StudioSection>

      <StudioSection title="Compte">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Le mot de passe, l&apos;adresse e-mail, la double authentification et les sessions
            actives se gèrent depuis les paramètres du compte personnel.
          </p>
          <AccountLink />
        </div>
      </StudioSection>
    </StudioPage>
  );
}
