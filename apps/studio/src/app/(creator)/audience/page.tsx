// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/audience/page.tsx
// =====================================================================
// Go en primaire : GET /v1/analytics/audience/subscribers (module Go
// analytics, réservé créateur).

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
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

  // Go : liste des abonnés de la publication.
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
}
