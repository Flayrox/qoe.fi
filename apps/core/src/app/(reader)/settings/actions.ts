'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qoe/db/client';
import { notifications } from '@qoe/db';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import type { MeProfile } from '@/lib/cached-queries';

// ── Contrats des endpoints Go lecteur ────────────────────────────────────
interface UserSettingsDTO {
  id: string;
  userId: string;
  profileVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  allowMentions: boolean;
  allowCollaborationInvites: boolean;
  showSensitiveContent: boolean;
  autoplayMedia: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  fontScale: number;
  defaultFeed: 'FOLLOWING' | 'DISCOVER';
  createdAt: string;
  updatedAt: string;
}

// Forme normalisée consommée par SettingsPageClient (dates en ISO string).
export interface AccountSettingsData {
  user: {
    id: string;
    email: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    onboardingText: string | null;
    pronouns: string | null;
    role: string;
    createdAt: string;
  };
  settings: UserSettingsDTO;
  preferences: NotificationPrefs;
  deletionRequest: DeletionRequestDTO | null;
}
interface DeletionRequestDTO {
  id: string;
  status: string;
  requestedAt: string;
}
type NotificationPrefs = Record<string, boolean>;

async function getAccountUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();
  if (error || !authUser) throw new Error('UNAUTHORIZED');

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) throw new Error('Utilisateur introuvable.');
  return { user, supabase };
}

export async function getAccountSettingsAction(): Promise<AccountSettingsData> {
  // Go en primaire (4 endpoints parallèles) — fallback Prisma en dev.
  try {
    const [profile, settings, prefs, deletion] = await Promise.all([
      goFetch<MeProfile>('/v1/me'),
      goFetch<UserSettingsDTO>('/v1/settings/preferences'),
      goFetch<{ preferences: NotificationPrefs }>('/v1/notifications/preferences'),
      goFetch<DeletionRequestDTO | null>('/v1/me/account-deletion-request'),
    ]);
    return {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        username: profile.username,
        logoUrl: profile.logoUrl,
        onboardingText: profile.onboardingText,
        pronouns: profile.pronouns,
        role: profile.role,
        createdAt: profile.createdAt,
      },
      settings,
      preferences: prefs.preferences,
      deletionRequest: deletion,
    };
  } catch {
    // Fallback Prisma (dev sans QOE_API_URL).
    const { user } = await getAccountUser();
    const [settings, preferences, deletionRequest] = await Promise.all([
      prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      }),
      notifications.getPreferences(user.id),
      prisma.accountDeletionRequest.findFirst({
        where: { userId: user.id },
        orderBy: { requestedAt: 'desc' },
        select: { id: true, status: true, requestedAt: true },
      }),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        logoUrl: user.logoUrl,
        onboardingText: user.onboardingText,
        pronouns: user.pronouns,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      settings: {
        id: settings.id,
        userId: settings.userId,
        profileVisibility: settings.profileVisibility as UserSettingsDTO['profileVisibility'],
        allowMentions: settings.allowMentions,
        allowCollaborationInvites: settings.allowCollaborationInvites,
        showSensitiveContent: settings.showSensitiveContent,
        autoplayMedia: settings.autoplayMedia,
        reduceMotion: settings.reduceMotion,
        highContrast: settings.highContrast,
        fontScale: settings.fontScale,
        defaultFeed: settings.defaultFeed as UserSettingsDTO['defaultFeed'],
        createdAt: settings.createdAt.toISOString(),
        updatedAt: settings.updatedAt.toISOString(),
      },
      preferences: pickNotificationPrefs(preferences),
      deletionRequest: deletionRequest
        ? {
            id: deletionRequest.id,
            status: deletionRequest.status,
            requestedAt: deletionRequest.requestedAt.toISOString(),
          }
        : null,
    };
  }
}

export async function updateAccountProfileAction(input: {
  name: string;
  username: string;
  onboardingText: string;
  logoUrl: string;
  pronouns: string;
}) {
  const username = input.username.trim().toLowerCase().replace(/^@/, '');

  // Go en primaire — les messages de validation du Go sont ceux du front.
  try {
    await goFetch('/v1/me/profile', { method: 'PATCH', body: input });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    if (message && !message.includes('QOE_API_URL non configuré')) {
      throw new Error(message);
    }
    await updateAccountProfilePrisma(input);
  }

  revalidatePath('/settings');
  revalidatePath(`/@${username}`);
  return { success: true };
}

async function updateAccountProfilePrisma(input: {
  name: string;
  username: string;
  onboardingText: string;
  logoUrl: string;
  pronouns: string;
}) {
  const { user } = await getAccountUser();
  const name = input.name.trim().slice(0, 120);
  const username = input.username.trim().toLowerCase().replace(/^@/, '');
  const onboardingText = input.onboardingText.trim().slice(0, 500);
  const logoUrl = input.logoUrl.trim().slice(0, 2000);
  const pronouns = input.pronouns.trim().slice(0, 50) || null;

  if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new Error(
      'Le nom d’utilisateur doit contenir 3 à 30 caractères : lettres, chiffres ou _.'
    );
  }

  const existing = username
    ? await prisma.user.findFirst({
        where: { username, NOT: { id: user.id } },
        select: { id: true },
      })
    : null;
  if (existing) throw new Error('Ce nom d’utilisateur est déjà utilisé.');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name || null,
      username: username || null,
      onboardingText: onboardingText || null,
      logoUrl: logoUrl || null,
      pronouns,
    },
  });
}

export type AccountSettingsPatch = Partial<{
  profileVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  allowMentions: boolean;
  allowCollaborationInvites: boolean;
  showSensitiveContent: boolean;
  autoplayMedia: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  fontScale: number;
  defaultFeed: 'FOLLOWING' | 'DISCOVER';
}>;

export async function updateAccountSettingsAction(input: AccountSettingsPatch) {
  // Go en primaire — patch à clés validées côté Go.
  try {
    const settings = await goFetch<UserSettingsDTO>('/v1/settings/preferences', {
      method: 'PATCH',
      body: input,
    });
    revalidatePath('/settings');
    return { success: true, settings };
  } catch {
    // Fallback Prisma (dev sans QOE_API_URL).
    const { user } = await getAccountUser();
    const patch: AccountSettingsPatch = {};

    if (
      input.profileVisibility &&
      ['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(input.profileVisibility)
    ) {
      patch.profileVisibility = input.profileVisibility;
    }
    if (typeof input.allowMentions === 'boolean') patch.allowMentions = input.allowMentions;
    if (typeof input.allowCollaborationInvites === 'boolean') {
      patch.allowCollaborationInvites = input.allowCollaborationInvites;
    }
    if (typeof input.showSensitiveContent === 'boolean') {
      patch.showSensitiveContent = input.showSensitiveContent;
    }
    if (typeof input.autoplayMedia === 'boolean') patch.autoplayMedia = input.autoplayMedia;
    if (typeof input.reduceMotion === 'boolean') patch.reduceMotion = input.reduceMotion;
    if (typeof input.highContrast === 'boolean') patch.highContrast = input.highContrast;
    if (typeof input.fontScale === 'number' && [90, 100, 110, 125].includes(input.fontScale)) {
      patch.fontScale = input.fontScale;
    }
    if (input.defaultFeed && ['FOLLOWING', 'DISCOVER'].includes(input.defaultFeed)) {
      patch.defaultFeed = input.defaultFeed;
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...patch },
      update: patch,
    });

    revalidatePath('/settings');
    return {
      success: true,
      settings: {
        id: settings.id,
        userId: settings.userId,
        profileVisibility: settings.profileVisibility as UserSettingsDTO['profileVisibility'],
        allowMentions: settings.allowMentions,
        allowCollaborationInvites: settings.allowCollaborationInvites,
        showSensitiveContent: settings.showSensitiveContent,
        autoplayMedia: settings.autoplayMedia,
        reduceMotion: settings.reduceMotion,
        highContrast: settings.highContrast,
        fontScale: settings.fontScale,
        defaultFeed: settings.defaultFeed as UserSettingsDTO['defaultFeed'],
        createdAt: settings.createdAt.toISOString(),
        updatedAt: settings.updatedAt.toISOString(),
      },
    };
  }
}

// Ne garde que les clés booléennes des préférences de notifications (le
// row Prisma porte aussi createdAt/updatedAt — exclus du contrat UI).
const NOTIFICATION_PREF_KEYS = [
  'emailLikes',
  'pushLikes',
  'emailReplies',
  'pushReplies',
  'emailMentions',
  'pushMentions',
  'emailFollows',
  'pushFollows',
  'emailReposts',
  'pushReposts',
  'emailComments',
  'pushComments',
  'emailMedia',
  'pushMedia',
  'emailCollaborations',
  'pushCollaborations',
] as const;

function pickNotificationPrefs(prefs: Record<string, unknown>): NotificationPrefs {
  const out: NotificationPrefs = {};
  for (const k of NOTIFICATION_PREF_KEYS) {
    out[k] = Boolean(prefs[k]);
  }
  return out;
}

export async function exportAccountDataAction() {
  // Export de données : conservé sur Prisma (action rare, volume complet).
  const { user } = await getAccountUser();
  const [settings, preferences, thoughts, articles, highlights, bookmarks, follows] =
    await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
      prisma.thought.findMany({ where: { authorId: user.id }, orderBy: { createdAt: 'asc' } }),
      prisma.article.findMany({
        where: { authorId: user.id },
        select: {
          id: true,
          title: true,
          slug: true,
          content: true,
          published: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.highlight.findMany({ where: { readerId: user.id }, orderBy: { createdAt: 'asc' } }),
      prisma.bookmark.findMany({ where: { readerId: user.id }, orderBy: { createdAt: 'asc' } }),
      prisma.follows.findMany({
        where: { readerId: user.id },
        select: { publicationId: true, createdAt: true },
      }),
    ]);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        onboardingText: user.onboardingText,
        createdAt: user.createdAt,
      },
      settings,
      notificationPreferences: preferences,
      thoughts,
      articles,
      highlights,
      bookmarks,
      follows,
    },
    (_key, value) => (value instanceof Date ? value.toISOString() : value),
    2
  );
}

export async function requestAccountDeletionAction(confirmation: string) {
  if (confirmation !== 'DELETE') {
    throw new Error('Écrivez DELETE pour confirmer la demande.');
  }

  try {
    await goFetch('/v1/me/account-deletion-request', { method: 'POST', body: {} });
  } catch {
    const { user } = await getAccountUser();
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId: user.id, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (!existing) {
      await prisma.accountDeletionRequest.create({
        data: {
          userId: user.id,
          reason: 'User requested account deletion from settings',
        },
      });
    }
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function cancelAccountDeletionAction() {
  try {
    await goFetch('/v1/me/account-deletion-request', { method: 'DELETE' });
  } catch {
    const { user } = await getAccountUser();
    await prisma.accountDeletionRequest.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
  }
  revalidatePath('/settings');
  return { success: true };
}

export async function logoutAccountAction() {
  const { supabase } = await getAccountUser();
  await supabase.auth.signOut();
}
