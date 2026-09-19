'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { fetchMeProfile } from '@/lib/me';

// ── Contrats des endpoints Go lecteur ────────────────────────────────────
interface UserSettingsDTO {
  id: string;
  userId: string;
  profileVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  allowMentions: boolean;
  allowCollaborationInvites: boolean;
  collaborationInvitePermission?: 'EVERYONE' | 'MUTUALS' | 'FOLLOWING' | 'MEDIA_ONLY' | 'NOBODY';
  showSensitiveContent: boolean;
  likeVisibility: 'PUBLIC' | 'PRIVATE';
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
    fetchMeProfile(),
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
  collaborationInvitePermission?: 'EVERYONE' | 'MUTUALS' | 'FOLLOWING' | 'MEDIA_ONLY' | 'NOBODY';
  showSensitiveContent: boolean;
  likeVisibility: 'PUBLIC' | 'PRIVATE';
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

// Contrôles sociaux persistés : listes et bascules déléguées à l'API Go.
export async function getBlockedUsersAction() {
  return goFetch<{
    users: Array<{
      id: string;
      username: string | null;
      name: string | null;
      logoUrl: string | null;
    }>;
  }>('/v1/me/blocked-users');
}

export async function getMutedUsersAction() {
  return goFetch<{
    users: Array<{
      id: string;
      username: string | null;
      name: string | null;
      logoUrl: string | null;
    }>;
  }>('/v1/me/muted-users');
}

export async function toggleBlockedUserAction(id: string) {
  return goFetch<{ blocked: boolean }>(`/v1/me/blocked-users/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    body: {},
  });
}

export async function toggleMutedUserAction(id: string) {
  return goFetch<{ muted: boolean }>(`/v1/me/muted-users/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    body: {},
  });
}

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
  if (newPassword.length < 12) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 12 caractères.');
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw new Error('Le mot de passe doit mélanger majuscules, minuscules et chiffres.');
  }
  // Go en primaire : vérifie le mot de passe actuel (réauthentification) puis
  // met à jour via GoTrue admin. Le client Supabase ne peut PAS vérifier
  // l'ancien mot de passe — c'était la faille du formulaire précédent.
  await goFetch('/v1/me/password-change', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  revalidatePath('/settings');
  return { success: true };
}

/**
 * CHANGE D'EMAIL — POST /v1/me/email-change.
 * Réauthentification par mot de passe actuel, puis email de vérification
 * vers la nouvelle adresse (jamais de changement silencieux).
 */
export async function changeEmailAction(currentPassword: string, newEmail: string) {
  const email = newEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Adresse email invalide.');
  }
  await goFetch('/v1/me/email-change', {
    method: 'POST',
    body: { currentPassword, newEmail: email },
  });
  revalidatePath('/settings');
  return { success: true };
}

/**
 * CHANGE L'USERNAME — PATCH /v1/me/profile (username explicite).
 * Le endpoint recharge l'username courant si le corps n'en contient pas :
 * ici il est TOUJOURS transmis, donc validé (format + unicité + liste
 * réservée) côté Go.
 */
export async function changeUsernameAction(newUsername: string) {
  const username = newUsername.trim().toLowerCase().replace(/^@/, '');
  if (username.length < 3 || username.length > 24) {
    throw new Error('Le nom d’utilisateur doit contenir 3 à 24 caractères.');
  }
  // Le Go valide le format, les identifiants réservés et l’unicité.
  const profile = await goFetch<{ username?: string | null }>('/v1/me/profile', {
    method: 'PATCH',
    body: { username },
  });
  revalidatePath('/settings');
  revalidatePath(`/@${profile.username ?? username}`);
  return { success: true, username: profile.username ?? username };
}

export async function logoutAccountAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
