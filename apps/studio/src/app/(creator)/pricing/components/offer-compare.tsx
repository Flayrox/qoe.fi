'use client';

import React from 'react';
import { Check, Minus, Clock } from 'lucide-react';
import { t } from '@lingui/core/macro';

// =====================================================================
// 💎 OfferCompare — comparatif Gratuit vs Pro (data-driven, docs/OFFERS.md)
// =====================================================================
// level: 'free' (inclus gratuit) | 'pro' (palier emailPro, réel) |
// 'soon' (tranche 7 ou roadmap — affiché « Bientôt », jamais vendu).
// =====================================================================

type Level = 'free' | 'pro' | 'soon';

interface OfferRow {
  label: string;
  hint: string;
  level: Level;
}

const ROWS = (): OfferRow[] => [
  {
    label: 'Publier textes, newsletters, collections',
    hint: t`Plateforme complète, sans limite de volume éditorial.`,
    level: 'free',
  },
  {
    label: 'Template e-mail classique (nom + logo)',
    hint: t`E-mails soignés, sujets et textes par défaut localisés.`,
    level: 'free',
  },
  {
    label: t`Abonnés, audience, imports validés`,
    hint: t`Croissance sans compteur caché.`,
    level: 'free',
  },
  {
    label: t`API & webhooks développeur`,
    hint: t`Automatiser et intégrer votre média.`,
    level: 'free',
  },
  {
    label: t`Personnalisation des e-mails`,
    hint: t`Nom d'expéditeur, reply-to, couleurs, sujets, aperçus, note de pied, corps du bienvenue.`,
    level: 'pro',
  },
  {
    label: t`Domaine personnalisé + DKIM/SPF/DMARC`,
    hint: t`Envoyer depuis votre propre domaine, réputation maîtrisée.`,
    level: 'soon',
  },
  {
    label: t`Statistiques avancées`,
    hint: t`Ouvertures, clics, cohortes — au-delà de l’audience de base.`,
    level: 'soon',
  },
];

function Cell({ level }: { level: Level }) {
  if (level === 'free')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text">
        <Check className="w-4 h-4" /> {t`Inclus`}
      </span>
    );
  if (level === 'pro')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
        <Check className="w-4 h-4" /> {t`Pro`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
      <Clock className="w-3.5 h-3.5" /> {t`Bientôt`}
    </span>
  );
}

export function OfferCompare({ supportUrl }: { supportUrl: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/60 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t`Gratuit`}
          </p>
          <p className="text-3xl font-bold mt-1">
            {t`0 €`}{' '}
            <span className="text-sm font-normal text-muted-foreground">{t`pour toujours`}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {t`Tout ce qui fait vivre le réseau : publier, envoyer, grandir.`}
          </p>
        </div>
        <div className="rounded-xl border-2 border-primary/60 p-6 relative">
          <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            {t`Pro`}
          </span>
          <p className="text-3xl font-bold mt-1">
            {t`Bientôt`}{' '}
            <span className="text-sm font-normal text-muted-foreground">{t`lancement prochain`}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {t`Votre identité jusque dans la boîte mail —`}{' '}
            <strong>{t`plus tous les avantages lecteur Plus inclus, sans surcoût`}</strong>{' '}
            {t`— et vous financez une plateforme indépendante.`}
          </p>
          <a
            href={supportUrl}
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            {t`Être tenu au courant`}
          </a>
          <p className="text-[11px] text-muted-foreground mt-2">
            {t`Pas de faux bouton d'achat : dites-le nous via le support, on vous recontacte.`}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-2.5 bg-muted/30 items-center">
          <span />
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold uppercase text-muted-foreground w-[62px] text-center">
              {t`Gratuit`}
            </span>
            <span className="text-[10px] font-bold uppercase text-muted-foreground w-[62px] text-center">
              {t`Pro`}
            </span>
          </div>
        </div>
        {ROWS().map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_auto] gap-3 px-5 py-3.5 items-start ${
              i > 0 ? 'border-t border-border/40' : ''
            }`}
          >
            <div>
              <p className="text-xs font-semibold flex items-center gap-1.5">
                {row.label}
                {row.level === 'pro' && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase text-primary">
                    {t`Pro`}
                  </span>
                )}
                {row.level === 'soon' && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-bold uppercase text-muted-foreground">
                    {t`Bientôt`}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{row.hint}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-[62px] flex justify-center">
                {row.level === 'free' ? (
                  <Cell level="free" />
                ) : (
                  <span className="text-muted-foreground">
                    <Minus className="w-4 h-4" />
                  </span>
                )}
              </span>
              <span className="w-[62px] flex justify-center">
                {row.level === 'free' ? (
                  <span className="text-muted-foreground">
                    <Minus className="w-4 h-4" />
                  </span>
                ) : (
                  <Cell level={row.level} />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {t`Ce qui crée le réseau reste gratuit : lire, publier, suivre, commenter, collections de base et réglages essentiels ne passeront jamais en payant.`}
      </p>
    </div>
  );
}
