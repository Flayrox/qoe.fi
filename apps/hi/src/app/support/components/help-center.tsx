'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { useI18n } from '@qoe/i18n';
import { Input, InputGroup } from '@qoe/ui/input';
import { SupportForm } from './support-form';

// =====================================================================
// 🎫 Centre d'aide — points déjà traités + formulaire (tranche 6)
// =====================================================================
// La plupart des demandes ont une réponse immédiate (lien expiré, compte
// perdu, désabonnement…) : la FAQ filtrée répond sans dossier. Sinon, le
// formulaire ouvre un dossier (invité ou au compte si connecté sur hi).
// Contenu géré par le staff, servi en FR et EN : on n'affiche que la langue
// active (la recherche, elle, interroge les deux).
// =====================================================================

import { filterFaq, mergeFaq, type ManagedArticle } from './help-faq';

export function HelpCenter({ appUrl, managed }: { appUrl: string; managed: ManagedArticle[] }) {
  const [query, setQuery] = useState('');
  const i18n = useI18n();
  const isFr = i18n.getLanguage() !== 'en';
  const entries = useMemo(() => mergeFaq(managed), [managed]);
  const results = useMemo(() => filterFaq(entries, query), [entries, query]);

  return (
    <div className="space-y-10">
      <InputGroup size="lg" left={<Search />}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t`Rechercher : compte perdu, confirmation, désabonnement…`}
        />
      </InputGroup>

      <div className="space-y-3">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t`Aucun point traité ne correspond — décrivez votre cas ci-dessous.`}
          </p>
        ) : (
          results.map((e) => (
            <details key={e.id} className="rounded-xl border border-border/60 px-4 py-3 group">
              <summary className="text-sm font-semibold cursor-pointer list-none flex justify-between gap-3">
                <span>{isFr ? e.qFr : e.qEn}</span>
                <span className="text-muted-foreground group-open:rotate-45 transition-transform text-lg leading-none">
                  +
                </span>
              </summary>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {isFr ? e.aFr : e.aEn}
              </p>
            </details>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border/60 p-5 space-y-2">
        <h2 className="text-sm font-semibold">{t`Déjà un dossier ?`}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t`Connectez-vous à votre espace pour suivre vos dossiers et recours —`}{' '}
          <a href={`${appUrl}/support`} className="underline underline-offset-2 font-semibold">
            {t`mes dossiers support`}
          </a>{' '}
          ·{' '}
          <a href={`${appUrl}/appeals`} className="underline underline-offset-2 font-semibold">
            {t`mes recours`}
          </a>
          .
        </p>
      </div>

      <div id="contacter" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-bold">{t`Contacter le support`}</h2>
        <SupportForm />
      </div>
    </div>
  );
}
