import React from 'react';
import { LoginFormBento } from '@qoe/ui';
import type { ConsentDocument } from '@qoe/utils/legal-consent';

export function LoginForm({
  consentDocuments,
  locale,
}: {
  consentDocuments?: ConsentDocument[];
  locale?: string;
}) {
  return (
    <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto">
      <LoginFormBento
        showLanguageSwitch={true}
        consentDocuments={consentDocuments}
        consentLocale={locale}
      />
    </div>
  );
}
