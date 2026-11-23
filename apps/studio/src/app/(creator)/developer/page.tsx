// =====================================================================
// 🖥️ Vue d'ensemble — apps/studio/src/app/(creator)/developer/page.tsx
// =====================================================================
// Le statut, les permissions et la prochaine action passent avant le reste.
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { DeveloperOverview } from '@/features/developer/components/developer-overview';
import { getDeveloperAccess, getDeveloperKeys } from '@/features/developer/server';
import { developerWorkspaceAccess, type DeveloperWorkspace } from '@/features/developer/types';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Développeur | qoefi` : 'Developer | qoefi',
    description: isFr
      ? t`Gérez vos accès API, webhooks et applications OAuth.`
      : 'Manage your API access, webhooks and OAuth applications.',
  };
}

export default async function DeveloperPage() {
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

  return <DeveloperOverview access={access} keyCount={keys.length} workspace={workspaceContext} />;
}
