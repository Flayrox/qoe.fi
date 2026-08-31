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
