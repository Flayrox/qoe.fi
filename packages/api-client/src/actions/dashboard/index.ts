'use server';

import { prisma, type User, type Prisma } from '@qoe/db/client';
import { publications } from '@qoe/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { safeAction } from '../utils/safe-action';
import { goFetch, isGoEnabled } from '../utils/go-client';

/**
 * 🎛️ Résout la publication active (personnelle OU média) depuis le cookie du workspace.
 */
async function getActivePublicationId(userId: string): Promise<string> {
  let saved: { type?: string; id?: string } | null = null;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('qoe_active_workspace')?.value;
    if (raw) saved = JSON.parse(decodeURIComponent(raw));
  } catch {
    saved = null;
  }

  if (saved?.type === 'MEDIA' && saved.id) {
    const membership = await prisma.mediaMember.findUnique({
      where: { mediaId_userId: { mediaId: saved.id, userId } },
      include: { media: { include: { publication: { select: { id: true } } } } },
    });
    if (membership) return membership.media.publication.id;
  }

  const personal = await publications.getOrCreatePersonalPublication(userId);
  return personal.id;
}

interface UpdateCreatorProfileInput {
  name?: string | null;
  heroText?: string | null;
  onboardingText?: string | null;
  accentColor?: string | null;
  layoutStyle?: string | null;
  logoUrl?: string | null;
  headerImageUrl?: string | null;
  fontFamily?: string | null;
  themeMode?: string | null;
  footerText?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  allowIndexing?: boolean;
  supportUrl?: string | null;
}

interface NavigationLinkInput {
  label: string;
  url: string | null;
}

interface SocialLinkInput {
  platform: string;
  url: string;
}

interface CompleteOnboardingInput {
  name: string;
  heroText: string;
  subdomain: string;
  layoutStyle: string;
  advancedSettingsMode: boolean;
}

export const updateCreatorProfileAction = safeAction<UpdateCreatorProfileInput, User>(
  async (data, user) => {
    const publicationId = await getActivePublicationId(user.id);
    if (isGoEnabled()) {
      return goFetch<User>('/v1/settings/profile', {
        method: 'PATCH',
        body: { publicationId, ...data },
      });
    }
    const updateData: Prisma.PublicationUpdateInput = {
      ...(data.heroText !== undefined ? { heroText: data.heroText } : {}),
      ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
      ...(data.layoutStyle !== undefined ? { layoutStyle: data.layoutStyle } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.headerImageUrl !== undefined ? { headerImageUrl: data.headerImageUrl } : {}),
      ...(data.fontFamily !== undefined ? { fontFamily: data.fontFamily } : {}),
      ...(data.themeMode !== undefined ? { themeMode: data.themeMode } : {}),
      ...(data.footerText !== undefined ? { footerText: data.footerText } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
      ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
      ...(data.allowIndexing !== undefined ? { allowIndexing: data.allowIndexing } : {}),
      ...(data.supportUrl !== undefined ? { supportUrl: data.supportUrl } : {}),
      ...(data.name !== undefined && data.name ? { name: data.name } : {}),
    };
    await prisma.publication.update({ where: { id: publicationId }, data: updateData });
    if (data.onboardingText !== undefined) {
      await prisma.user.update({
        where: { id: user.id },
        data: { onboardingText: data.onboardingText },
      });
    }
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    if (!updated) throw new Error('Utilisateur introuvable');
    revalidatePath('/settings');
    return updated;
  }
);

const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'feed',
  'help',
  'login',
  'main',
  'media',
  'onboarding',
  'portal',
  'qoe',
  'root',
  'settings',
  'start',
  'static',
  'status',
  'store',
  'studio',
  'support',
  'www',
];

export const checkSubdomainAvailabilityAction = safeAction<
  string,
  { available: boolean; reason?: string }
>(
  async (subdomain) => {
    if (isGoEnabled()) {
      return goFetch<{ available: boolean; reason?: string }>(
        `/v1/settings/subdomain/check?subdomain=${encodeURIComponent(subdomain)}`
      );
    }
    const clean = subdomain.trim().toLowerCase();
    const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!regex.test(clean)) {
      return {
        available: false,
        reason: 'Le sous-domaine ne doit contenir que des lettres minuscules, chiffres et tirets.',
      };
    }
    if (clean.length < 3 || clean.length > 30) {
      return {
        available: false,
        reason: 'La longueur doit être comprise entre 3 et 30 caractères.',
      };
    }
    if (RESERVED_SUBDOMAINS.includes(clean)) {
      return { available: false, reason: 'Ce nom de sous-domaine est réservé par la plateforme.' };
    }

    const existing = await prisma.publication.findFirst({ where: { subdomain: clean } });
    if (existing) {
      return {
        available: false,
        reason: 'Ce sous-domaine est déjà attribué à une autre publication.',
      };
    }

    return { available: true };
  },
  { requireAuth: false }
);

export const updateSubdomainAction = safeAction<string, { success: boolean; subdomain: string }>(
  async (subdomain, user) => {
    if (isGoEnabled()) {
      const publicationId = await getActivePublicationId(user.id);
      return goFetch<{ success: boolean; subdomain: string }>('/v1/settings/subdomain', {
        method: 'POST',
        body: { publicationId, subdomain },
      });
    }
    const check = await checkSubdomainAvailabilityAction(subdomain);
    if (!check.ok || !check.data.available) {
      throw new Error(check.ok ? check.data.reason : 'Sous-domaine invalide.');
    }

    const publicationId = await getActivePublicationId(user.id);
    const updated = await prisma.publication.update({
      where: { id: publicationId },
      data: { subdomain: subdomain.trim().toLowerCase() },
    });

    revalidatePath('/settings');
    return { success: true, subdomain: updated.subdomain! };
  }
);

export const saveNavigationLinksAction = safeAction<NavigationLinkInput[], { success: boolean }>(
  async (links, user) => {
    const publicationId = await getActivePublicationId(user.id);
    if (isGoEnabled()) {
      await goFetch('/v1/settings/navigation', {
        method: 'PUT',
        body: { publicationId, links },
      });
      revalidatePath('/settings');
      return { success: true };
    }
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.navigationItem.deleteMany({ where: { publicationId } });
      if (links.length > 0) {
        await tx.navigationItem.createMany({
          data: links.map((link, idx) => ({
            publicationId,
            label: link.label,
            url: link.url,
            order: idx,
          })),
        });
      }
    });
    revalidatePath('/settings');
    return { success: true };
  }
);

export const saveSocialLinksAction = safeAction<SocialLinkInput[], { success: boolean }>(
  async (links, user) => {
    const publicationId = await getActivePublicationId(user.id);
    if (isGoEnabled()) {
      await goFetch('/v1/settings/social', {
        method: 'PUT',
        body: { publicationId, links },
      });
      revalidatePath('/settings');
      return { success: true };
    }
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.socialLink.deleteMany({ where: { publicationId } });
      if (links.length > 0) {
        await tx.socialLink.createMany({
          data: links.map((link) => ({
            publicationId,
            platform: link.platform,
            url: link.url,
          })),
        });
      }
    });

    revalidatePath('/settings');
    return { success: true };
  }
);

export const submitApiApplicationAction = safeAction<string, { success: boolean }>(
  async (reason, user) => {
    if (isGoEnabled()) {
      await goFetch('/v1/settings/api-application', {
        method: 'POST',
        body: { reason },
      });
      revalidatePath('/developer');
      return { success: true };
    }
    if (!reason || reason.trim().length < 10) {
      throw new Error('Veuillez fournir une explication détaillée (au moins 10 caractères).');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        apiAccessStatus: 'pending',
        apiApplicationReason: reason.trim(),
      },
    });

    revalidatePath('/developer');
    return { success: true };
  }
);

export const generateApiKeyAction = safeAction<string, { apiKey: string }>(async (name, user) => {
  if (isGoEnabled()) {
    const res = await goFetch<{ apiKey: string }>('/v1/settings/api-keys', {
      method: 'POST',
      body: { name },
    });
    revalidatePath('/developer');
    return res;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { apiAccessStatus: true },
  });

  if (!dbUser || dbUser.apiAccessStatus !== 'approved') {
    throw new Error("Votre demande d'accès à l'API doit être approuvée par un administrateur.");
  }

  const { randomBytes, createHash } = await import('node:crypto');
  const rawToken = randomBytes(16).toString('hex');
  const apiKey = `qoe_live_${rawToken}`;
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  await prisma.apiKey.create({
    data: {
      name: name.trim() || 'Clé API',
      keyHash,
      keyPrefix: 'qoe_live',
      user: { connect: { id: user.id } },
    },
  });

  revalidatePath('/developer');
  return { apiKey };
});

export const revokeApiKeyAction = safeAction<string, { success: boolean }>(async (id, user) => {
  if (isGoEnabled()) {
    await goFetch(`/v1/settings/api-keys/${id}`, { method: 'DELETE' });
    revalidatePath('/developer');
    return { success: true };
  }
  await prisma.apiKey.deleteMany({
    where: { id, userId: user.id },
  });
  revalidatePath('/developer');
  return { success: true };
});

export const completeOnboardingAction = safeAction<CompleteOnboardingInput, { success: boolean }>(
  async (data, user) => {
    if (isGoEnabled()) {
      await goFetch('/v1/settings/onboarding', {
        method: 'POST',
        body: {
          name: data.name,
          heroText: data.heroText,
          subdomain: data.subdomain,
          layoutStyle: data.layoutStyle,
        },
      });
      revalidatePath('/');
      return { success: true };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: user.role === 'superadmin' ? 'superadmin' : 'creator',
        hasCompletedOnboarding: true,
        name: data.name || user.user_metadata?.['name'],
      },
    });
    await publications
      .createPersonalPublication(user.id, {
        name: data.name || user.user_metadata?.['name'] || 'Créateur',
        subdomain: data.subdomain,
        heroText: data.heroText,
        layoutStyle: data.layoutStyle,
        slug: (user.user_metadata?.['username'] as string | undefined) || data.name || 'creator',
      })
      .catch(async () => {
        // Publication déjà créée (re-onboarding) : on synchronise
        await publications.syncUserPublication(user.id, {
          name: data.name || undefined,
          subdomain: data.subdomain,
          heroText: data.heroText,
          layoutStyle: data.layoutStyle,
        });
      });
    revalidatePath('/');
    return { success: true };
  }
);
