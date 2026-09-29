'use client';

import React, { useMemo, useState } from 'react';
import { SupportForm } from './support-form';

// =====================================================================
// 🎫 Centre d'aide — points déjà traités + formulaire (tranche 6)
// =====================================================================
// La plupart des demandes ont une réponse immédiate (lien expiré, compte
// perdu, désabonnement…) : la FAQ filtrée répond sans dossier. Sinon, le
// formulaire ouvre un dossier (invité ou au compte si connecté sur hi).
// Contenu statique bilingue versionné en code (évolution : générer depuis
// les dossiers résolus — pas avant le volume).
// =====================================================================

import { filterFaq, mergeFaq, type ManagedArticle } from './help-faq';

export function HelpCenter({ appUrl, managed }: { appUrl: string; managed: ManagedArticle[] }) {
  const [query, setQuery] = useState('');
  const entries = useMemo(() => mergeFaq(managed), [managed]);
  const results = useMemo(() => filterFaq(entries, query), [entries, query]);

  return (
    <div className="space-y-10">
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher : compte perdu, confirmation, désabonnement… / Search…"
          className="w-full text-sm px-4 py-3 rounded-xl border border-border bg-background outline-none"
        />
      </div>

      <div className="space-y-3">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun point traité ne correspond — décrivez votre cas ci-dessous. / No match — describe
            your case below.
          </p>
        ) : (
          results.map((e) => (
            <details key={e.id} className="rounded-xl border border-border/60 px-4 py-3 group">
              <summary className="text-sm font-semibold cursor-pointer list-none flex justify-between gap-3">
                <span>
                  {e.qFr}
                  <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                    {e.qEn}
                  </span>
                </span>
                <span className="text-muted-foreground group-open:rotate-45 transition-transform text-lg leading-none">
                  +
                </span>
              </summary>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{e.aFr}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{e.aEn}</p>
            </details>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border/60 p-5 space-y-2">
        <h2 className="text-sm font-semibold">Déjà un dossier ? / Already have a case?</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connectez-vous à votre espace pour suivre vos dossiers et recours —{' '}
          <a href={`${appUrl}/support`} className="underline underline-offset-2 font-semibold">
            mes dossiers support
          </a>{' '}
          ·{' '}
          <a href={`${appUrl}/recours`} className="underline underline-offset-2 font-semibold">
            mes recours
          </a>
          . / Log in to follow your cases.
        </p>
      </div>

      <div id="contacter" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-bold">Contacter le support / Contact support</h2>
        <SupportForm />
      </div>
    </div>
  );
}
