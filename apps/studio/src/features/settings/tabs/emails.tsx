'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/emails.tsx
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { EmailTemplates } from '../components/email-templates';

interface EmailsTabProps {
  publicationId?: string;
}

export function EmailsTab({ publicationId }: EmailsTabProps) {
  if (!publicationId) {
    return (
      <div className="py-16 text-center text-xs text-muted-foreground">
        {t`Réglages email indisponibles pour ce workspace.`}
      </div>
    );
  }

  return <EmailTemplates publicationId={publicationId} />;
}
