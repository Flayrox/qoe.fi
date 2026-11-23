// =====================================================================
// 🔑 Clés d'API — apps/studio/src/app/(creator)/developer/keys/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { DeveloperKeysClient } from '@/features/developer/components/developer-keys-client';
import { getDeveloperAccess, getDeveloperKeys } from '@/features/developer/server';
import { developerWorkspaceAccess, type DeveloperWorkspace } from '@/features/developer/types';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Clés d'API | qoefi` : 'API keys | qoefi',
    description: isFr
      ? t`Générez et révoquez les clés API de votre workspace.`
      : 'Generate and revoke your workspace API keys.',
  };
}

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
