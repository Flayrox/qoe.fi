'use server';

import { prisma, type User, type Prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';
import { safeAction } from '../utils/safe-action';

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
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.heroText !== undefined ? { heroText: data.heroText } : {}),
        ...(data.onboardingText !== undefined ? { onboardingText: data.onboardingText } : {}),
        ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
        ...(data.layoutStyle !== undefined ? { layoutStyle: data.layoutStyle } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.headerImageUrl !== undefined ? { headerImageUrl: data.headerImageUrl } : {}),
      },
    });
    revalidatePath('/dashboard/settings');
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

    const existing = await prisma.user.findFirst({ where: { subdomain: clean } });
    if (existing) {
      return { available: false, reason: 'Ce sous-domaine est déjà attribué à un autre créateur.' };
    }

    return { available: true };
  },
  { requireAuth: false }
);

export const updateSubdomainAction = safeAction<string, { success: boolean; subdomain: string }>(
  async (subdomain, user) => {
    const check = await checkSubdomainAvailabilityAction(subdomain);
    if (!check.ok || !check.data.available) {
      throw new Error(check.ok ? check.data.reason : 'Sous-domaine invalide.');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { subdomain: subdomain.trim().toLowerCase() },
    });

    revalidatePath('/dashboard/settings');
    return { success: true, subdomain: updated.subdomain! };
  }
);

export const saveNavigationLinksAction = safeAction<NavigationLinkInput[], { success: boolean }>(
  async (links, user) => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.navigationItem.deleteMany({ where: { userId: user.id } });
      if (links.length > 0) {
        await tx.navigationItem.createMany({
          data: links.map((link, idx) => ({
            userId: user.id,
            label: link.label,
            url: link.url,
            order: idx,
          })),
        });
      }
    });
    revalidatePath('/dashboard/settings');
    return { success: true };
  }
);

export const saveSocialLinksAction = safeAction<SocialLinkInput[], { success: boolean }>(
  async (links, user) => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.socialLink.deleteMany({ where: { userId: user.id } });
      if (links.length > 0) {
        await tx.socialLink.createMany({
          data: links.map((link) => ({
            userId: user.id,
            platform: link.platform,
            url: link.url,
          })),
        });
      }
    });

    revalidatePath('/dashboard/settings');
    return { success: true };
  }
);

export const submitApiApplicationAction = safeAction<string, { success: boolean }>(
  async (reason, user) => {
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
  await prisma.apiKey.deleteMany({
    where: { id, userId: user.id },
  });
  revalidatePath('/developer');
  return { success: true };
});

export const completeOnboardingAction = safeAction<CompleteOnboardingInput, { success: boolean }>(
  async (data, user) => {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: user.role === 'superadmin' ? 'superadmin' : 'creator',
        hasCompletedOnboarding: true,
        subdomain: data.subdomain,
        name: data.name || user.user_metadata?.['name'],
      },
    });
    revalidatePath('/dashboard');
    return { success: true };
  }
);
