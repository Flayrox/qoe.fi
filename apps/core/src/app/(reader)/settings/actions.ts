'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
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
  mutedWords: string[];
}
interface DeletionRequestDTO {
  id: string;
  status: string;
  requestedAt: string;
}
type NotificationPrefs = Record<string, boolean>;

export async function getAccountSettingsAction(): Promise<AccountSettingsData> {
  // Go (backend-of-record, requis en Phase 3) : 5 endpoints parallèles.
  const [profile, settings, prefs, deletion, muted] = await Promise.all([
    goFetch<MeProfile>('/v1/me'),
    goFetch<UserSettingsDTO>('/v1/settings/preferences'),
    goFetch<{ preferences: NotificationPrefs }>('/v1/notifications/preferences'),
    goFetch<DeletionRequestDTO | null>('/v1/me/account-deletion-request'),
    goFetch<{ words: string[] }>('/v1/me/muted-words'),
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
    mutedWords: muted.words,
  };
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
  await goFetch('/v1/me/profile', { method: 'PATCH', body: input });

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
  // Go en primaire — patch à clés validées côté Go.
  const settings = await goFetch<UserSettingsDTO>('/v1/settings/preferences', {
    method: 'PATCH',
    body: input,
  });
  revalidatePath('/settings');
  return { success: true, settings };
}

// Mots masqués : POST est une bascule idempotente (ajout OU retrait).
export async function toggleMutedWordAction(word: string) {
  const res = await goFetch<{ muted: boolean; word: string }>('/v1/me/muted-words', {
    method: 'POST',
    body: { word },
  });
  revalidatePath('/settings');
  return res;
}

export async function exportAccountDataAction() {
  // Go (backend-of-record, requis en Phase 3) : GET /v1/me/data-export
  // (export complet GDPR — parité exportAccountDataAction Prisma).
  const data = await goFetch<Record<string, unknown>>('/v1/me/data-export');

  return JSON.stringify(
    data,
    (_key, value) => (value instanceof Date ? value.toISOString() : value),
    2
  );
}

export async function requestAccountDeletionAction(confirmation: string) {
  if (confirmation !== 'DELETE') {
    throw new Error('Écrivez DELETE pour confirmer la demande.');
  }

  await goFetch('/v1/me/account-deletion-request', { method: 'POST', body: {} });
  revalidatePath('/settings');
  return { success: true };
}

export async function cancelAccountDeletionAction() {
  await goFetch('/v1/me/account-deletion-request', { method: 'DELETE' });
  revalidatePath('/settings');
  return { success: true };
}

// Change le mot de passe via Supabase Auth (envoie un email de confirmation).
export async function changePasswordAction(currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw new Error(error.message);
  }
  void currentPassword; // Supabase n'exige pas l'ancien mot de passe via updateUser.
  revalidatePath('/settings');
  return { success: true };
}

export async function logoutAccountAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
