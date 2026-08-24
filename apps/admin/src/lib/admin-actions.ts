'use server';

// =====================================================================
// 🛡️ admin-actions — actions de modération de la console superadmin
// =====================================================================
// Go en primaire : PATCH /v1/admin/users/{id} (module Go `admin`,
// réservé superadmin). Fallback Prisma dev (verifySuperadmin + update)
// seulement si QOE_API_URL est absent. Le ban Supabase Auth (service
// role key) est conservé dans les deux chemins.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';

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

async function verifySuperadmin() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Unauthorized');

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (dbUser?.role !== 'superadmin') throw new Error('Forbidden');
  return dbUser;
}

export async function updateModerationAction(input: {
  userId: string;
  isCertified?: boolean;
  isShadowbanned?: boolean;
  isSuspended?: boolean;
  suspendReason?: string | null;
  publicationCertified?: boolean;
}) {
  await verifySuperadmin();

  if (isGoEnabled()) {
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
      };
    }
  }

  // 🐢 Fallback dev : Prisma.
  const data: Record<string, unknown> = {};
  if (input.isCertified !== undefined) data.isCertified = input.isCertified;
  if (input.isShadowbanned !== undefined) data.isShadowbanned = input.isShadowbanned;
  if (input.isSuspended !== undefined) data.isSuspended = input.isSuspended;
  if (input.suspendReason !== undefined) data.suspendReason = input.suspendReason;
  await prisma.user.update({ where: { id: input.userId }, data });

  // Certification de la publication associée (parité Go).
  if (input.publicationCertified !== undefined) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { publicationId: true },
    });
    if (user?.publicationId) {
      await prisma.publication.update({
        where: { id: user.publicationId },
        data: { isCertified: input.publicationCertified },
      });
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${input.userId}`);
  return { success: true as const };
}

/** ✅ Bannir (DB + Supabase Auth). */
export async function suspendUserAction(input: { userId: string; reason: string }) {
  await verifySuperadmin();
  const res = await updateModerationAction({
    userId: input.userId,
    isSuspended: true,
    suspendReason: input.reason,
  });
  if (!res.success) return res;

  // Ban Supabase Auth (les deux chemins).
  const adminClient = getAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(input.userId, {
    ban_duration: '876000h',
  });
  if (error) {
    throw new Error('User suspended in DB, but failed to ban in Auth.');
  }
  revalidatePath('/admin/users');
  return { success: true as const };
}

/** 🔓 Débannir (DB + Supabase Auth). */
export async function unsuspendUserAction(userId: string) {
  await verifySuperadmin();
  const res = await updateModerationAction({
    userId,
    isSuspended: false,
    suspendReason: null,
  });
  if (!res.success) return res;

  const adminClient = getAdminClient();
  await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
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
