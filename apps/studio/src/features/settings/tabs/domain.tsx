'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/domain.tsx
// =====================================================================

import React from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { UpcomingBadge } from '@qoe/ui';
import { Input, InputGroup } from '@qoe/ui/input';
import type { CreatorProfile } from '../types';
import { StudioField, StudioSection } from '@/components/studio-page';

interface DomainTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  subdomainInput: string;
  setSubdomainInput: (val: string) => void;
  subdomainCheck: {
    loading: boolean;
    available: boolean | null;
    error: string | null;
  };
}

export function DomainTab({
  current,
  setCurrent,
  subdomainInput,
  setSubdomainInput,
  subdomainCheck,
}: DomainTabProps) {
  return (
    <div className="max-w-3xl space-y-5">
      <StudioSection title="Adresse">
        <div className="space-y-5">
          <StudioField
            label="Sous-domaine qoefi"
            hint={
              subdomainInput
                ? `Adresse publique : ${subdomainInput}.qoe.fi`
                : 'Choisissez le nom sous lequel le site est accessible.'
            }
          >
            <InputGroup
              invalid={!subdomainCheck.loading && subdomainCheck.available === false}
              right={<span className="font-mono text-xs select-none">.qoe.fi</span>}
            >
              <Input
                type="text"
                value={subdomainInput}
                onChange={(event) => {
                  const value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setSubdomainInput(value);
                  setCurrent((prev) => ({ ...prev, subdomain: value }));
                }}
                placeholder="mon-espace"
              />
            </InputGroup>

            <div className="pt-1.5">
              {subdomainCheck.loading ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Vérification…
                </span>
              ) : null}
              {!subdomainCheck.loading && subdomainCheck.available === true ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-success-text">
                  <CheckCircle className="size-3.5" />
                  Sous-domaine disponible.
                </span>
              ) : null}
              {!subdomainCheck.loading && subdomainCheck.available === false ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-destructive-text">
                  <AlertCircle className="size-3.5" />
                  {subdomainCheck.error || 'Indisponible.'}
                </span>
              ) : null}
            </div>
          </StudioField>

          <div className="border-t border-border/40 pt-4">
            <StudioField
              label="Contact / support"
              hint="Un lien ou une adresse email affichés sur le site."
            >
              <Input
                type="text"
                value={current.supportUrl || ''}
                onChange={(event) =>
                  setCurrent((prev) => ({ ...prev, supportUrl: event.target.value }))
                }
                placeholder="contact@votre-domaine.com"
              />
            </StudioField>
          </div>
        </div>
      </StudioSection>

      <StudioSection
        title="Domaine personnalisé"
        actions={<UpcomingBadge feature="custom-domain" />}
      >
        <div className="space-y-3">
          <Input
            type="text"
            value={current.customDomain || ''}
            readOnly
            placeholder="journal.mon-domaine.com"
            aria-label="Domaine personnalisé"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pour rattacher un domaine, créez un enregistrement CNAME pointant vers{' '}
            <code className="font-mono text-foreground">cname.qoe.fi</code> chez votre fournisseur.
          </p>
        </div>
      </StudioSection>
    </div>
  );
}
