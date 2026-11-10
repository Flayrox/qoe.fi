// =====================================================================
// 🔑 Clés d'API — apps/studio/src/app/(creator)/developer/keys/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { DeveloperKeysClient } from '@/features/developer/components/developer-keys-client';
import { getDeveloperAccess, getDeveloperKeys } from '@/features/developer/server';
import { developerWorkspaceAccess, type DeveloperWorkspace } from '@/features/developer/types';

export const metadata = {
  title: "Clés d'API | qoefi",
  description: 'Générez et révoquez les clés API de votre workspace.',
};

export default async function DeveloperKeysPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const workspace = await getActiveWorkspace(user.id);
  const workspaceContext: DeveloperWorkspace = {
    type: workspace.type,
    name: workspace.name,
    mediaId: workspace.mediaId,
    publisherId: workspace.publisherId,
  };
  const access =
    workspace.type === 'MEDIA'
      ? developerWorkspaceAccess(workspaceContext)
      : await getDeveloperAccess();
  const keys = access.status === 'approved' ? await getDeveloperKeys(workspaceContext) : [];

  return <DeveloperKeysClient access={access} initialKeys={keys} workspace={workspaceContext} />;
}
