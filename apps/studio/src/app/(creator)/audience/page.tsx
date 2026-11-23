// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/audience/page.tsx
// =====================================================================
// Go en primaire : GET /v1/analytics/audience/subscribers (module Go
// analytics, réservé créateur). La lecture dégrade proprement : une panne
// analytics laisse l'écran utilisable et dit pourquoi la liste est vide.

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { AudienceClient } from './AudienceClient';
import { loadAudience } from './load-audience';

export default async function AudiencePage() {
  const user = await requireUser();

  if (!user) {
    redirect('/login');
  }

  const workspace = await getActiveWorkspace(user.id);
  const audience = await loadAudience(workspace.publisherId);

  return (
    <AudienceClient initialSubscribers={audience.subscribers} unavailable={audience.unavailable} />
  );
}
