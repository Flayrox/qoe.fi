'use server';

import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';

async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('UNAUTHORIZED');

  const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { role: true } });
  if (user?.role !== 'superadmin') throw new Error('FORBIDDEN');
}

export async function retryNotificationDeliveryAction(deliveryId: string) {
  await requireSuperadmin();
  await prisma.notificationDelivery.updateMany({
    where: { id: deliveryId, status: { in: ['FAILED', 'DISABLED'] } },
    data: { status: 'QUEUED', availableAt: new Date(), lastError: null },
  });
  return { success: true };
}
