import type { ReactNode } from 'react';
import { StudioHeader, StudioPage } from '@/components/studio-page';
import { DeveloperNav } from './developer-nav';
import { DeveloperStatusBadge } from './developer-status-badge';
import type { DeveloperAccess } from '../types';
import { t } from '@lingui/core/macro';

export function DeveloperShell({
  access,
  description = t`Clés, webhooks et applications OAuth de votre espace.`,
  children,
}: {
  access: DeveloperAccess;
  description?: string;
  children: ReactNode;
}) {
  return (
    <StudioPage>
      <StudioHeader
        title={t`Développeur`}
        description={description}
        badge={<DeveloperStatusBadge status={access.status} />}
      />
      <DeveloperNav />
      {children}
    </StudioPage>
  );
}
