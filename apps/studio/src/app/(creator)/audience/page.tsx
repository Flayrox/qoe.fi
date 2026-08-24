// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/audience/page.tsx
// =====================================================================
// Go en primaire (GET /v1/analytics/audience/subscribers) — fallback Prisma dev.

import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
import { AudienceClient, SubscriberItem } from './AudienceClient';

interface SubscriberDTO {
  id: string;
  email: string;
  isActive: boolean;
  isPremium: boolean;
  ltvCents: number;
  createdAt: string;
}

export default async function AudiencePage() {
  const user = await requireUser();

  if (!user) {
    redirect('/login');
  }

  const workspace = await getActiveWorkspace(user.id);

  // Go en primaire : liste des abonnés de la publication (chemin nominal).
  if (isGoEnabled()) {
    try {
      const res = await goFetch<{ subscribers: SubscriberDTO[] }>(
        `/v1/analytics/audience/subscribers?publicationId=${encodeURIComponent(
          workspace.publicationId
        )}`
      );
      const serializedSubscribers: SubscriberItem[] = (res.subscribers ?? []).map((sub) => ({
        id: sub.id,
        email: sub.email,
        isActive: sub.isActive,
        isPremium: sub.isPremium,
        ltvCents: sub.ltvCents || 0,
        createdAt: sub.createdAt,
      }));
      return <AudienceClient initialSubscribers={serializedSubscribers} />;
    } catch {
      // Fallback Prisma dev ci-dessous (QOE_API_URL indisponible).
    }
  }

  // ⚠️ Fallback dev — le chemin nominal est le Go ci-dessus.
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
