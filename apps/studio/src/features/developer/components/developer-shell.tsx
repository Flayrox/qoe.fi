import type { ReactNode } from 'react';
import { StudioHeader, StudioPage } from '@/components/studio-page';
import { DeveloperNav } from './developer-nav';
import { DeveloperStatusBadge } from './developer-status-badge';
import type { DeveloperAccess } from '../types';

export function DeveloperShell({
  access,
  description = 'Clés, webhooks et applications OAuth de votre espace.',
  children,
}: {
  access: DeveloperAccess;
  description?: string;
  children: ReactNode;
}) {
  return (
    <StudioPage>
      <StudioHeader
        title="Développeur"
        description={description}
        badge={<DeveloperStatusBadge status={access.status} />}
      />
      <DeveloperNav />
      {children}
    </StudioPage>
  );
}
