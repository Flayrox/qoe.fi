'use client';

import React from 'react';
import Link from 'next/link';
import {
  Check,
  Minus,
  Clock,
  Sparkles,
  Headphones,
  BookOpen,
  Download,
  Brain,
  Palette,
} from 'lucide-react';
import { routes } from '@qoe/config/routes';
import { useFlag } from '@qoe/flags';

type Level = 'free' | 'plus' | 'soon';

interface PricingRow {
  label: string;
  hint: string;
  level: Level;
  icon?: React.ComponentType<{ className?: string }>;
}

const ROWS: PricingRow[] = [
  {
    label: 'Lecture de tous les articles et pensées publics',
    hint: 'Accès sans restriction au réseau et à l’ensemble des publications libres.',
    level: 'free',
  },
  {
    label: 'Surlignages et réflexions personnelles',
    hint: 'Sauvegardez vos passages préférés, sans aucune limite de quantité.',
    level: 'free',
  },
  {
    label: 'Signets et bibliothèque personnelle',
    hint: 'Retrouvez vos lectures en cours sur tous vos appareils.',
    level: 'free',
  },
  {
    label: 'Écoute vocale Text-to-Speech (TTS)',
    hint: 'Écoutez les articles et vos livres lus avec une voix naturelle haute fidélité.',
    level: 'plus',
    icon: Headphones,
  },
  {
    label: 'Packs hors-ligne et file d’écoute',
    hint: 'Emportez vos écrits et chapitres partout avec vous, même sans réseau.',
    level: 'plus',
    icon: Download,
  },
  {
    label: 'Assistant IA de lecture (résumé & explication)',
    hint: 'Synthétisez un article en 3 points ou éclairez un passage complexe en un clic.',
    level: 'plus',
    icon: Brain,
  },
  {
    label: 'Thèmes de lecture confort (Papier, Nuit chaude)',
    hint: 'Palette douce pour les yeux pensée pour les longues sessions de lecture nocturnes.',
    level: 'plus',
    icon: Palette,
  },
  {
    label: 'EPUBs personnels illimités',
    hint: 'Importez tous vos livres personnels (5 gratuits, illimité avec Plus).',
    level: 'plus',
    icon: BookOpen,
  },
  {
    label: 'Recherche sémantique & flashcards espacées',
    hint: 'Retrouvez des concepts par le sens et ancrez vos connaissances sur le long terme.',
    level: 'soon',
  },
];

function Cell({ level }: { level: Level }) {
  if (level === 'free') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
        <Check className="w-4 h-4" /> Inclus
      </span>
    );
  }
  if (level === 'plus') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
        <Check className="w-4 h-4" /> Plus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
      <Clock className="w-3.5 h-3.5" /> Bientôt
    </span>
  );
}

export function PricingCompare({ supportUrl }: { supportUrl: string }) {
  const isCheckoutEnabled = useFlag('subscription-checkout-enabled');

  return (
    <div className="space-y-8">
      {/* ─── Cartes d'offres ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gratuit */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Lecteur Gratuit
              </span>
              <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                Actif
              </span>
            </div>
            <div className="mt-3">
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                0 € <span className="text-xs font-normal text-muted-foreground">pour toujours</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Ce qui fait vivre le réseau : lire, explorer, annoter et sauvegarder sans jamais
                sortir la carte bancaire.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <span className="text-xs font-medium text-muted-foreground">
              ✓ Inclus par défaut avec votre compte
            </span>
          </div>
        </div>

        {/* Plus */}
        <div className="rounded-2xl border-2 border-primary/60 bg-gradient-to-br from-card via-card to-primary/5 p-6 relative shadow-md flex flex-col justify-between">
          <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-xs flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Soutien Lecteur
          </span>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Qoefi Plus
              </span>
              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                {isCheckoutEnabled ? 'Disponible' : 'Lancement prochain'}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                3,99 €{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / mois (indicatif)
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                L’expérience de lecture augmentée : audio haute fidélité, mode hors-ligne, assistant
                IA et confort visuel — tout en soutenant l&apos;indépendance de la plateforme.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40 space-y-2">
            {isCheckoutEnabled ? (
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Souscrire à Qoefi Plus (3,99 €/mois)
              </button>
            ) : (
              <>
                <a
                  href={supportUrl}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Demander un accès anticipé
                </a>
                <p className="text-[11px] text-muted-foreground text-center">
                  Le paiement par carte sera déployé avec Stripe. Pour tester en avant-première,
                  écrivez-nous !
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Encadré Pro inclut Plus ─── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <p className="font-bold text-foreground">💡 Vous écrivez ou éditez un média ?</p>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            L&apos;abonnement <strong>Pro</strong> dans Studio inclut l&apos;intégralité des
            avantages Plus sans aucun surcoût. Un seul abonnement pour tout l&apos;écosystème.
          </p>
        </div>
        <Link
          href={routes.feed.billing()}
          className="text-primary hover:underline font-semibold text-xs whitespace-nowrap"
        >
          Voir mon portefeuille →
        </Link>
      </div>

      {/* ─── Tableau comparatif détaillé ─── */}
      <div className="rounded-2xl border border-border/60 overflow-hidden bg-card shadow-2xs">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-6 py-3 bg-muted/30 items-center border-b border-border/40">
          <span className="text-xs font-bold text-foreground">Fonctionnalités</span>
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-bold uppercase text-muted-foreground w-16 text-center">
              Gratuit
            </span>
            <span className="text-[10px] font-bold uppercase text-primary w-16 text-center">
              Plus
            </span>
          </div>
        </div>

        {ROWS.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_auto] gap-4 px-6 py-4 items-start ${
              i > 0 ? 'border-t border-border/40' : ''
            }`}
          >
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {row.icon && <row.icon className="w-3.5 h-3.5 text-primary" />}
                {row.label}
                {row.level === 'plus' && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase text-primary">
                    Plus
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

            <div className="flex items-center gap-6">
              <span className="w-16 flex justify-center">
                {row.level === 'free' ? (
                  <Cell level="free" />
                ) : (
                  <span className="text-muted-foreground">
                    <Minus className="w-4 h-4" />
                  </span>
                )}
              </span>
              <span className="w-16 flex justify-center">
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

      {/* ─── Mention d'engagement ─── */}
      <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
        Notre engagement : ce qui permet d&apos;apprendre, de lire et de partager le savoir restera
        toujours accessible et gratuit. Les abonnements soutiennent le développement de
        fonctionnalités d&apos;exception et les coûts variables de serveurs.
      </p>
    </div>
  );
}
