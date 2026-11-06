// =====================================================================
// 🖥️ Vue d'ensemble — apps/studio/src/app/(creator)/developer/page.tsx
// =====================================================================
// Le statut, les permissions et la prochaine action passent avant le reste.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { DeveloperOverview } from '@/features/developer/components/developer-overview';
import { getDeveloperAccess, getDeveloperKeys } from '@/features/developer/server';
import { developerWorkspaceAccess, type DeveloperWorkspace } from '@/features/developer/types';

export const metadata = {
  title: 'Développeur | qoefi',
  description: 'Gérez vos accès API, webhooks et applications OAuth.',
};

export default async function DeveloperPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const workspace = await getActiveWorkspace(user.id);
  const workspaceContext: DeveloperWorkspace = {
    type: workspace.type,
    name: workspace.name,
    mediaId: workspace.mediaId,
    publicationId: workspace.publicationId,
  };
  const access =
    workspace.type === 'MEDIA'
      ? developerWorkspaceAccess(workspaceContext)
      : await getDeveloperAccess();
  const keys = access.status === 'approved' ? await getDeveloperKeys(workspaceContext) : [];

  return <DeveloperOverview access={access} keyCount={keys.length} workspace={workspaceContext} />;
}
