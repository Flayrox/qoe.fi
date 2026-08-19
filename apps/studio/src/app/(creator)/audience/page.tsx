// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/audience/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { AudienceClient, SubscriberItem } from './AudienceClient';

export default async function AudiencePage() {
  const user = await requireUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch real creator subscribers from Prisma DB
  const workspace = await getActiveWorkspace(user.id);
  const dbSubscribers = await prisma.subscriber.findMany({
    where: { publicationId: workspace.publicationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      isActive: true,
      isPremium: true,
      ltvCents: true,
      createdAt: true,
    },
  });

  // Serialize dates safely for Next.js Client Components
  const serializedSubscribers: SubscriberItem[] = dbSubscribers.map((sub) => ({
    id: sub.id,
    email: sub.email,
    isActive: sub.isActive,
    isPremium: sub.isPremium,
    ltvCents: sub.ltvCents || 0,
    createdAt: sub.createdAt.toISOString(),
  }));

  return <AudienceClient initialSubscribers={serializedSubscribers} />;
}
