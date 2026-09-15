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

export async function enrollAccountSecurityMfaAction() {
  return goFetch<Record<string, unknown>>('/v1/me/mfa/totp/enroll', {
    method: 'POST',
    body: {},
  });
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
  fromName?: string;
  replyTo?: string;
  accentColor?: string;
  logoUrl?: string;
  // Clés « template.locale » (« confirm.fr », « welcome.es »…) générées
  // dynamiquement depuis la liste `locales` renvoyée par l'API — ajouter
  // une langue côté serveur suffit, aucun changement de type nécessaire.
  subjects?: Record<string, string>;
  preheaders?: Record<string, string>;
  footerNote?: string;
  welcomeEnabled?: boolean;
  welcomeBodyFr?: string;
  welcomeBodyEn?: string;
  welcomeBodies?: Record<string, string>;
}

export async function getEmailSettingsAction(publicationId: string) {
  return goFetch<{
    publicationName: string;
    emailSettings: PublicationEmailSettings;
    accentColor?: string;
    logoUrl?: string;
    locales: string[];
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
