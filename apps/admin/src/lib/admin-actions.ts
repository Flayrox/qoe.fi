'use server';

// =====================================================================
// 🛡️ admin-actions — actions de modération de la console superadmin
// =====================================================================
// Go en primaire : PATCH /v1/admin/users/{id} (module Go `admin`,
// réservé superadmin côté API — 403 sinon). Le ban Supabase Auth
// (service role key) est conservé côté TS.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl } from '@qoe/supabase/url';
import { revalidatePath } from 'next/cache';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { assertCapability } from '@/lib/admin-identity';
import { authzTrailers } from '@/lib/action-result';
import { requireSupabaseServiceRoleKey } from '@/lib/supabase/env';

function getAdminClient() {
  return createClient(
    resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_APP_URL),
    requireSupabaseServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Défense en profondeur : la server-action revérifie la CAPACITÉ de l'acte
// (modération de comptes), pas un rôle. Le garde HTTP du Go reste le seul juge —
// masquer un bouton n'autorise rien, mais une action qui échapperait à
// l'interface ne doit pas échapper au contrôle pour autant.
async function verifyModeration() {
  await assertCapability('admin.users.moderate');
}

export async function updateModerationAction(input: {
  userId: string;
  isCertified?: boolean;
  isShadowbanned?: boolean;
  isSuspended?: boolean;
  suspendReason?: string | null;
  publicationCertified?: boolean;
}) {
  await verifyModeration();

  try {
    const body: Record<string, unknown> = {};
    if (input.isCertified !== undefined) body.isCertified = input.isCertified;
    if (input.isShadowbanned !== undefined) body.isShadowbanned = input.isShadowbanned;
    if (input.isSuspended !== undefined) body.isSuspended = input.isSuspended;
    if (input.suspendReason !== undefined) body.suspendReason = input.suspendReason;
    if (input.publicationCertified !== undefined)
      body.publicationCertified = input.publicationCertified;
    await goFetch(`/v1/admin/users/${encodeURIComponent(input.userId)}`, {
      method: 'PATCH',
      body,
    });
    revalidatePath('/admin');
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${input.userId}`);
    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'Erreur serveur',
      // La modération de comptes exige N2 : sans ce code, l'écran ne saurait
      // pas qu'une vérification de facteur débloque l'acte.
      ...authzTrailers(err),
    };
  }
}

/** ✅ Bannir (DB + Supabase Auth) — un demi-succès se dit, il ne se jette pas. */
export async function suspendUserAction(input: { userId: string; reason: string }) {
  await verifyModeration();
  const res = await updateModerationAction({
    userId: input.userId,
    isSuspended: true,
    suspendReason: input.reason,
  });
  if (!res.success) return res;

  // Ban Supabase Auth : la suspension est déjà écrite en base. Si le bannissement
  // échoue, on rend un échec EXPLICITE (contrat `{ success:false, error }`)
  // au lieu de jeter — l'écran doit pouvoir dire que la session reste active.
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(input.userId, {
      ban_duration: '876000h',
    });
    if (error) {
      return {
        success: false as const,
        error:
          'Suspension enregistrée, mais le bannissement Auth a échoué : la session existante reste active.',
      };
    }
  } catch (err) {
    return {
      success: false as const,
      error: `Suspension enregistrée, mais le bannissement Auth a échoué : ${
        err instanceof Error ? err.message : 'erreur inconnue'
      }`,
    };
  }

  revalidatePath('/admin/users');
  return { success: true as const };
}

/** 🔓 Débannir (DB + Supabase Auth) — l'échec du débannissement n'est pas avalé. */
export async function unsuspendUserAction(userId: string) {
  await verifyModeration();
  const res = await updateModerationAction({
    userId,
    isSuspended: false,
    suspendReason: null,
  });
  if (!res.success) return res;

  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (error) {
      return {
        success: false as const,
        error:
          'Levée en base effectuée, mais le débannissement Auth a échoué : le compte reste banni à la connexion.',
      };
    }
  } catch (err) {
    return {
      success: false as const,
      error: `Levée en base effectuée, mais le débannissement Auth a échoué : ${
        err instanceof Error ? err.message : 'erreur inconnue'
      }`,
    };
  }

  revalidatePath('/admin/users');
  return { success: true as const };
}

/** ✅ / ❌ Certifier un créateur (user + publication associée). */
export async function toggleUserCertificationAction(input: {
  userId: string;
  isCertified: boolean;
}) {
  return updateModerationAction({
    userId: input.userId,
    isCertified: input.isCertified,
    publicationCertified: input.isCertified,
  });
}

/** 👻 Appliquer / lever un shadowban. */
export async function toggleUserShadowbanAction(input: {
  userId: string;
  isShadowbanned: boolean;
}) {
  return updateModerationAction({
    userId: input.userId,
    isShadowbanned: input.isShadowbanned,
  });
}
