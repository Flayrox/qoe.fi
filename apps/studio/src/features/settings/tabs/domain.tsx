'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/domain.tsx
// =====================================================================

import React from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { FeatureTeaser } from '@qoe/ui';
import type { CreatorProfile } from '../types';

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
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Adresse & Sous-domaine
        </h3>

        {/* Subdomain */}
        <div id="subdomain" className="space-y-2">
          <label className="text-xs font-semibold text-foreground block">Sous-domaine qoefi</label>
          <div className="relative flex items-center">
            <input
              type="text"
              value={subdomainInput}
              onChange={(e) => {
                const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                setSubdomainInput(val);
                setCurrent((prev) => ({ ...prev, subdomain: val }));
              }}
              className="w-full pl-3.5 pr-20 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
              placeholder="mon-espace"
            />
            <span className="absolute right-3 text-xs text-muted-foreground select-none font-mono">
              .qoe.fi
            </span>
          </div>

          <div>
            {subdomainCheck.loading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-primary" /> Vérification...
              </span>
            )}
            {!subdomainCheck.loading && subdomainCheck.available === true && (
              <span className="text-xs text-success font-medium flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Sous-domaine disponible.
              </span>
            )}
            {!subdomainCheck.loading && subdomainCheck.available === false && (
              <span className="text-xs text-destructive font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {subdomainCheck.error || 'Indisponible.'}
              </span>
            )}
          </div>
        </div>

        {/* Custom Domain — annoncé, pas encore provisionné.
         * Le champ reste VISIBLE (on montre ce qui arrive) mais réellement
         * inerte : aucun domaine fantôme ne peut être saisi puis oublié. */}
        <div id="custom" className="pt-4 border-t border-border/30">
          <FeatureTeaser feature="custom-domain">
            <div className="space-y-2.5 p-3.5">
              <label className="text-xs font-semibold text-foreground block">
                Domaine personnalisé propre
              </label>
              <input
                type="text"
                value={current.customDomain || ''}
                readOnly
                placeholder="journal.mon-domaine.com"
                className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground"
              />

              <div className="p-3.5 bg-muted/30 border border-border/40 rounded-lg space-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground block">
                  Configuration DNS recommandée :
                </span>
                <p>
                  Créez un enregistrement CNAME pointant vers{' '}
                  <code className="text-primary font-mono font-medium">cname.qoe.fi</code> chez
                  votre fournisseur de domaine.
                </p>
              </div>
            </div>
          </FeatureTeaser>
        </div>

        {/* Support Contact */}
        <div className="space-y-2 pt-4 border-t border-border/30">
          <label className="text-xs font-semibold text-foreground block">
            Support & Lien de contact
          </label>
          <input
            type="text"
            value={current.supportUrl || ''}
            onChange={(e) => setCurrent((prev) => ({ ...prev, supportUrl: e.target.value }))}
            placeholder="contact@votre-domaine.com ou https://support.votre-domaine.com"
            className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
