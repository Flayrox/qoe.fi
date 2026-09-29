'use server';

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export async function getAccountSecurityIdentityAction() {
  return goFetch<{ email: string }>('/v1/me/identity');
}

export async function getAccountSecurityMfaAction() {
  return goFetch<Record<string, unknown>>('/v1/me/mfa');
}

export async function getAccountSecuritySessionsAction() {
  return goFetch<{
    sessions: Array<{
      id: string;
      clientId: string;
      current: boolean;
      scopes?: string[];
      createdAt?: string;
      expiresAt?: string;
      lastUsedAt?: string;
    }>;
  }>('/v1/me/sessions');
}

export async function getAccountSecurityConsentAction() {
  return goFetch<{
    analytics: boolean;
    personalization: boolean;
    marketing: boolean;
    version: string;
    updatedAt?: string;
  }>('/v1/settings/consent');
}

/**
 * Crée un facteur TOTP. GoTrue renvoie `{ id, totp: { qr_code, secret, uri } }`.
 *
 * La **vérification** du facteur ne passe volontairement pas par ici : GoTrue
 * n'élève la session qu'en émettant un nouveau jeton pour le client courant, il
 * faut donc que l'échange `challenge`/`verify` vienne du navigateur (voir
 * `features/settings/components/mfa-panel.tsx`). Sinon l'utilisateur
 * enregistrerait un facteur sans jamais obtenir de session forte.
 */
export async function enrollAccountSecurityMfaAction(friendlyName?: string) {
  return goFetch<MfaEnrollResponse>('/v1/me/mfa/totp/enroll', {
    method: 'POST',
    body: friendlyName ? { friendly_name: friendlyName } : {},
  });
}

/** Retire un facteur (y compris un facteur créé mais jamais vérifié). */
export async function unenrollAccountSecurityMfaAction(factorId: string) {
  return goFetch<{ success: boolean }>(`/v1/me/mfa/totp/${encodeURIComponent(factorId)}`, {
    method: 'DELETE',
    body: {},
  });
}

export interface MfaFactorInfo {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status?: string;
  created_at?: string;
}

export interface MfaEnrollResponse {
  id?: string;
  friendly_name?: string;
  totp?: { qr_code?: string; secret?: string; uri?: string } | null;
}

export async function changeAccountSecurityEmailAction(newEmail: string, currentPassword: string) {
  return goFetch('/v1/me/email-change', {
    method: 'POST',
    body: { newEmail, currentPassword },
  });
}

export async function changeAccountSecurityPasswordAction(
  newPassword: string,
  currentPassword: string
) {
  return goFetch('/v1/me/password-change', {
    method: 'POST',
    body: { newPassword, currentPassword },
  });
}

export async function revokeOtherAccountSessionsAction() {
  return goFetch('/v1/me/sessions/revoke-others', { method: 'POST', body: {} });
}

export async function revokeAllAccountSessionsAction() {
  return goFetch('/v1/me/sessions/revoke-all', { method: 'POST', body: {} });
}

export async function updateAccountConsentAction(input: {
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  version: string;
}) {
  return goFetch('/v1/settings/consent', { method: 'PATCH', body: input });
}

export async function exportAccountSecurityDataAction() {
  return goFetch<Record<string, unknown>>('/v1/me/data-export');
}

export async function requestAccountSecurityDeletionAction() {
  return goFetch('/v1/me/account-deletion-request', { method: 'POST', body: {} });
}

// =====================================================================
// 📧 Réglages email transactionnels (double opt-in + bienvenue)
// =====================================================================
// GET  /v1/settings/email        → défauts + réglages assainis
// PATCH /v1/settings/email       → enregistre (les champs absents
//                                  retombent sur les défauts plateforme)
// POST /v1/settings/email/preview → rendu réel (même moteur que les
//                                  envois) pour la prévisualisation live.

export interface PublicationEmailSettings {
  // Champs PRO (verrouillés sans palier — voir emailPro) : nom
  // d'expéditeur, reply-to, accent, sujets, aperçus, note, corps — TOUS
  // UNIQUES (fini les variantes par langue, côté API comme ici).
  fromName?: string;
  replyTo?: string;
  accentColor?: string;
  subjects?: Record<string, string>;
  preheaders?: Record<string, string>;
  footerNote?: string;
  welcomeBody?: string;
  // Gratuits : logo, activation du bienvenue, langues d'envoi (locales).
  logoUrl?: string;
  welcomeEnabled?: boolean;
  // Palier lu (GET) — jamais envoyé (le serveur décide, pas le client).
  emailPro?: boolean;
}

export async function getEmailSettingsAction(publicationId: string) {
  return goFetch<{
    publicationName: string;
    emailSettings: PublicationEmailSettings;
    accentColor?: string;
    logoUrl?: string;
    locales: string[];
    emailPro: boolean;
  }>(`/v1/settings/email?publicationId=${encodeURIComponent(publicationId)}`);
}

export async function updateEmailSettingsAction(
  publicationId: string,
  settings: PublicationEmailSettings
) {
  return goFetch<{ emailSettings: PublicationEmailSettings }>('/v1/settings/email', {
    method: 'PATCH',
    body: { publicationId, settings },
  });
}

export async function previewEmailSettingsAction(
  publicationId: string,
  template: 'confirm' | 'welcome',
  locale: string,
  settings: PublicationEmailSettings
) {
  return goFetch<{ subject: string; from: string; html: string; text: string }>(
    '/v1/settings/email/preview',
    { method: 'POST', body: { publicationId, template, locale, settings } }
  );
}

export async function sendTestEmailAction(
  publicationId: string,
  template: 'confirm' | 'welcome',
  locale: string,
  settings: PublicationEmailSettings
) {
  return goFetch<{ sent: boolean; to: string; subject: string }>('/v1/settings/email/test', {
    method: 'POST',
    body: { publicationId, template, locale, settings },
  });
}
