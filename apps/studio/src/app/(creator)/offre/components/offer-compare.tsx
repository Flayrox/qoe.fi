'use client';

import React from 'react';
import { Check, Minus, Clock } from 'lucide-react';

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

const ROWS: OfferRow[] = [
  {
    label: 'Publier textes, newsletters, collections',
    hint: 'Plateforme complète, sans limite de volume éditorial.',
    level: 'free',
  },
  {
    label: 'Template e-mail classique (nom + logo)',
    hint: 'E-mails soignés, sujets et textes par défaut localisés.',
    level: 'free',
  },
  {
    label: 'Abonnés, audience, imports validés',
    hint: 'Croissance sans compteur caché.',
    level: 'free',
  },
  {
    label: 'API & webhooks développeur',
    hint: 'Automatiser et intégrer votre média.',
    level: 'free',
  },
  {
    label: 'Personnalisation des e-mails',
    hint: "Nom d'expéditeur, reply-to, couleurs, sujets, aperçus, note de pied, corps du bienvenue.",
    level: 'pro',
  },
  {
    label: 'Domaine personnalisé + DKIM/SPF/DMARC',
    hint: 'Envoyer depuis votre propre domaine, réputation maîtrisée.',
    level: 'soon',
  },
  {
    label: 'Statistiques avancées',
    hint: 'Ouvertures, clics, cohortes — au-delà de l’audience de base.',
    level: 'soon',
  },
];

function Cell({ level }: { level: Level }) {
  if (level === 'free')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
        <Check className="w-4 h-4" /> Inclus
      </span>
    );
  if (level === 'pro')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
        <Check className="w-4 h-4" /> Pro
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
      <Clock className="w-3.5 h-3.5" /> Bientôt
    </span>
  );
}

export function OfferCompare({ supportUrl }: { supportUrl: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/60 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Gratuit
          </p>
          <p className="text-3xl font-bold mt-1">
            0 € <span className="text-sm font-normal text-muted-foreground">pour toujours</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Tout ce qui fait vivre le réseau : publier, envoyer, grandir.
          </p>
        </div>
        <div className="rounded-2xl border-2 border-primary/60 p-6 relative">
          <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            Pro
          </span>
          <p className="text-3xl font-bold mt-1">
            Bientôt{' '}
            <span className="text-sm font-normal text-muted-foreground">lancement prochain</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Votre identité jusque dans la boîte mail — et vous financez une plateforme indépendante.
          </p>
          <a
            href={supportUrl}
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Être tenu au courant
          </a>
          <p className="text-[11px] text-muted-foreground mt-2">
            Pas de faux bouton d&apos;achat : dites-le nous via le support, on vous recontacte.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-2.5 bg-muted/30 items-center">
          <span />
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold uppercase text-muted-foreground w-[62px] text-center">
              Gratuit
            </span>
            <span className="text-[10px] font-bold uppercase text-muted-foreground w-[62px] text-center">
              Pro
            </span>
          </div>
        </div>
        {ROWS.map((row, i) => (
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
                    Pro
                  </span>
                )}
                {row.level === 'soon' && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-bold uppercase text-muted-foreground">
                    Bientôt
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
        Ce qui crée le réseau reste gratuit : lire, publier, suivre, commenter, collections de base
        et réglages essentiels ne passeront jamais en payant.
      </p>
    </div>
  );
}
