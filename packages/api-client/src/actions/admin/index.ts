'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';
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

export const setSystemConfigAction = safeAction<
  { key: string; value: string; description?: string },
  { success: boolean }
>(async ({ key, value, description }) => {
  await verifySuperadmin();
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value, description },
    create: { key, value, description },
  });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const deleteSystemConfigAction = safeAction<string, { success: boolean }>(async (key) => {
  await verifySuperadmin();
  await prisma.systemConfig.delete({ where: { key } });
  revalidatePath('/', 'layout');
  return { success: true };
});

export const suspendUserAction = safeAction<
  { userId: string; reason: string },
  { success: boolean }
>(async ({ userId, reason }) => {
  await verifySuperadmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isSuspended: true, suspendReason: reason },
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
  await verifySuperadmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isSuspended: false, suspendReason: null },
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
  await verifySuperadmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isCertified },
  });
  revalidatePath('/admin/creators');
  return { success: true };
});

export const toggleUserShadowbanAction = safeAction<
  { userId: string; isShadowbanned: boolean },
  { success: boolean }
>(async ({ userId, isShadowbanned }) => {
  await verifySuperadmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isShadowbanned },
  });
  revalidatePath('/admin/creators');
  return { success: true };
});

export const updateCreatorApiAccessAction = safeAction<
  { userId: string; status: 'approved' | 'rejected' | 'revoked' | 'none' },
  { success: boolean }
>(async ({ userId, status }) => {
  await verifySuperadmin();
  await prisma.user.update({
    where: { id: userId },
    data: { apiAccessStatus: status },
  });
  revalidatePath('/admin/api');
  return { success: true };
});
