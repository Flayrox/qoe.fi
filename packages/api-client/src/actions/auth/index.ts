'use server';

import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';

export async function getCurrentUserAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subdomain: true,
      customDomain: true,
      logoUrl: true,
      hasCompletedOnboarding: true,
    },
  });

  return dbUser;
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}
