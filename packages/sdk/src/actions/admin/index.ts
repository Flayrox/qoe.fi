'use server';

// =====================================================================
// 🛡️ actions/admin — Server Actions de la console superadmin
// =====================================================================
// Toutes les actions vérifient `verifySuperadmin()` (rôle DB ==
// 'superadmin') avant d'agir. Utilise le client Supabase admin (service
// role key) pour les opérations d'auth (ban/unban).
// ⚠️ Fichier serveur, app admin uniquement — jamais exposé au mobile.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { goFetch } from '../utils/go-client';
import { safeAction } from '../utils/safe-action';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export const setSystemConfigAction = safeAction<
  { key: string; value: string; description?: string },
  { success: boolean }
>(async ({ key, value, description }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch('/v1/admin/config', {
    method: 'PUT',
    body: { key, value, description },
  });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const deleteSystemConfigAction = safeAction<string, { success: boolean }>(async (key) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const suspendUserAction = safeAction<
  { userId: string; reason: string },
  { success: boolean }
>(async ({ userId, reason }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isSuspended: true, suspendReason: reason },
  });

  const adminClient = getAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });

  if (error) {
    throw new Error('User suspended in DB, but failed to ban in Auth.');
  }

  revalidatePath('/admin/creators');
  return { success: true };
});

export const unsuspendUserAction = safeAction<string, { success: boolean }>(async (userId) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isSuspended: false, suspendReason: null },
  });

  const adminClient = getAdminClient();
  await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });

  revalidatePath('/admin/creators');
  return { success: true };
});

export const toggleUserCertificationAction = safeAction<
  { userId: string; isCertified: boolean },
  { success: boolean }
>(async ({ userId, isCertified }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isCertified },
  });
  revalidatePath('/admin/creators');
  return { success: true };
});

export const toggleUserShadowbanAction = safeAction<
  { userId: string; isShadowbanned: boolean },
  { success: boolean }
>(async ({ userId, isShadowbanned }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { isShadowbanned },
  });
  revalidatePath('/admin/creators');
  return { success: true };
});

/** 🔐 Approuve / rejette / révoque une application OAuth (console superadmin). */
export const updateOAuthClientStatusAction = safeAction<
  { clientId: string; status: 'APPROVED' | 'REJECTED' | 'REVOKED' | 'PENDING' },
  { success: boolean }
>(async ({ clientId, status }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: { status },
  });
  revalidatePath('/admin/oauth');
  return { success: true };
});

export const updateCreatorApiAccessAction = safeAction<
  { userId: string; status: 'approved' | 'rejected' | 'revoked' | 'none' },
  { success: boolean }
>(async ({ userId, status }) => {
  // Le backend Go vérifie le rôle superadmin (403 sinon).
  await goFetch(`/v1/admin/api-applicants/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { status },
  });
  revalidatePath('/admin/api');
  return { success: true };
});
