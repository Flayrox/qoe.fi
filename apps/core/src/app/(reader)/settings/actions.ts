'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qoe/db/client';
import { notifications } from '@qoe/db';
import { createClient } from '@qoe/supabase/server';

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

export async function getAccountSettingsAction() {
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
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    settings,
    preferences,
    deletionRequest: deletionRequest
      ? {
          id: deletionRequest.id,
          status: deletionRequest.status,
          requestedAt: deletionRequest.requestedAt.toISOString(),
        }
      : null,
  };
}

export async function updateAccountProfileAction(input: {
  name: string;
  username: string;
  onboardingText: string;
  logoUrl: string;
}) {
  const { user } = await getAccountUser();
  const name = input.name.trim().slice(0, 120);
  const username = input.username.trim().toLowerCase().replace(/^@/, '');
  const onboardingText = input.onboardingText.trim().slice(0, 500);
  const logoUrl = input.logoUrl.trim().slice(0, 2000);

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
    },
  });

  revalidatePath('/settings');
  revalidatePath(`/@${username}`);
  return { success: true };
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
  return { success: true, settings };
}

export async function exportAccountDataAction() {
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
  const { user } = await getAccountUser();
  if (confirmation !== 'DELETE') {
    throw new Error('Écrivez DELETE pour confirmer la demande.');
  }

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

  revalidatePath('/settings');
  return { success: true };
}

export async function cancelAccountDeletionAction() {
  const { user } = await getAccountUser();
  await prisma.accountDeletionRequest.updateMany({
    where: { userId: user.id, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });
  revalidatePath('/settings');
  return { success: true };
}

export async function logoutAccountAction() {
  const { supabase } = await getAccountUser();
  await supabase.auth.signOut();
}
