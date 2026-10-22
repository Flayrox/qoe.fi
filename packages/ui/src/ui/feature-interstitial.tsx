'use client';

// =====================================================================
// 🪟 feature-interstitial.tsx — L'interstitiel unique des fonctionnalités
// =====================================================================
// 📖 Un seul endroit pour ANNONCER ce qui n'est pas disponible aujourd'hui :
//    statut, ce que ça fait, quand, à quel palier, et une action claire.
//
// 🧭 Deux façons de l'utiliser, un seul rendu :
//    • <FeatureAnnouncementProvider onSignal={...}> une fois dans l'app,
//      puis useFeatureAnnouncement().open('ma-cle') n'importe où.
//    • <FeatureInterstitial featureKey="ma-cle" open onOpenChange={...} />
//      en composant contrôlé (site public, tests, portails).
//
// 📡 Chaque ouverture et chaque « me prévenir » émet un signal typé : c'est
//    la seule source de la mesure d'intérêt (créateur ou média), côté
//    appelant — le composant ne connaît ni l'API ni la télémétrie.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Check, Clock, Globe, Info, Loader2, Lock, Mail, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import {
  DEFAULT_FEATURE_LOCALE,
  FEATURE_STATUS_COPY,
  getFeature,
  localize,
  type FeatureDefinition,
  type FeatureKey,
  type FeatureLocale,
  type FeatureStatus,
} from './feature-catalog';

// ── Types publics ────────────────────────────────────────────────────

/** Signal émis par l'interstitiel. `kind` distingue l'intérêt de l'action. */
export interface FeatureSignal {
  feature: FeatureKey;
  kind: 'view' | 'notify';
}

export interface FeatureInterstitialProps {
  featureKey: FeatureKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale?: FeatureLocale;
  /** Destination du bouton « Pro ». Par défaut /pricing. */
  pricingHref?: string;
  /** Appelé à l'ouverture (view) et au clic sur « Me prévenir » (notify). */
  onSignal?: (signal: FeatureSignal) => void | Promise<void>;
  /**
   * État « déjà prévenu » contrôlé : le provider s'en souvient d'une
   * ouverture à l'autre, la promesse survit donc à la fermeture.
   */
  notified?: boolean;
  /** Notifie le porteur d'état qu'un « me prévenir » vient d'aboutir. */
  onNotified?: () => void;
}

// ── Icônes (le catalogue reste sans React) ──────────────────────────

const FEATURE_ICONS: Record<
  FeatureDefinition['icon'],
  React.ComponentType<{ className?: string }>
> = {
  globe: Globe,
  mail: Mail,
  lock: Lock,
  clock: Clock,
  sparkles: Sparkles,
};

const STATUS_ICONS: Record<FeatureStatus, React.ComponentType<{ className?: string }>> = {
  'in-development': Clock,
  pro: Lock,
  'coming-soon': Info,
};

// ── Interstitiel ─────────────────────────────────────────────────────

/**
 * Annonce d'une fonctionnalité en un seul écran : ce qu'elle fait, quand
 * elle arrive, ce qu'elle coûte, et l'action utile (être prévenu ou
 * découvrir l'offre Pro). Aucun faux bouton d'achat.
 */
export function FeatureInterstitial({
  featureKey,
  open,
  onOpenChange,
  locale = DEFAULT_FEATURE_LOCALE,
  pricingHref = '/pricing',
  onSignal,
  notified,
  onNotified,
}: FeatureInterstitialProps) {
  const feature = getFeature(featureKey);
  const [pending, setPending] = React.useState(false);
  const [localNotified, setLocalNotified] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const viewed = React.useRef(false);
  const isNotified = notified ?? localNotified;

  // Le signal de vue part une fois par ouverture, jamais à chaque rendu.
  React.useEffect(() => {
    if (!open) {
      viewed.current = false;
      return;
    }
    if (viewed.current || !onSignal) return;
    viewed.current = true;
    void Promise.resolve(onSignal({ feature: featureKey, kind: 'view' })).catch(() => {
      // Best-effort : un signal manquant ne casse jamais l'annonce.
    });
  }, [open, onSignal, featureKey]);

  React.useEffect(() => {
    if (open) {
      setFailed(false);
    }
  }, [open]);

  if (!feature) return null;

  const { copy } = feature;
  const statusCopy = FEATURE_STATUS_COPY[feature.status];
  const FeatureIcon = FEATURE_ICONS[feature.icon];
  const StatusIcon = STATUS_ICONS[feature.status];
  const isUpgrade = feature.cta === 'upgrade';

  const notify = async () => {
    if (pending || isNotified) return;
    setPending(true);
    setFailed(false);
    try {
      await onSignal?.({ feature: featureKey, kind: 'notify' });
      setLocalNotified(true);
      onNotified?.();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        {/* Bandeau d'identité : icône + statut, sans emphase inutile. */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border/40 bg-muted/20">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-foreground"
            aria-hidden="true"
          >
            <FeatureIcon className="w-4 h-4" />
          </span>
          <DialogHeader className="flex-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <StatusIcon className="w-3 h-3" aria-hidden="true" />
              {localize(statusCopy.label, locale)}
              <span aria-hidden="true" className="text-border">
                /
              </span>
              {feature.plan === 'pro' ? 'Pro' : localize({ fr: 'Inclus', en: 'Included' }, locale)}
            </span>
            <DialogTitle className="mt-1">{localize(copy.title, locale)}</DialogTitle>
            <DialogDescription className="mt-1 leading-relaxed">
              {localize(copy.summary, locale)}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Corps : bénéfices concrets + disponibilité. */}
        <div className="px-5 py-4 space-y-4">
          <ul className="space-y-2.5">
            {copy.details.map((detail) => (
              <li key={detail.fr} className="flex items-start gap-2.5 text-xs leading-relaxed">
                <Check
                  className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
                <span className="text-muted-foreground">{localize(detail, locale)}</span>
              </li>
            ))}
          </ul>

          <p className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <span>{localize(copy.availability, locale)}</span>
          </p>
        </div>

        {/* Pied : une action principale, une sortie discrète. */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-5 pb-5 pt-1">
          {failed && (
            <p className="text-[11px] text-destructive sm:mr-auto" role="status">
              {localize(
                {
                  fr: 'Enregistrement impossible. Réessayez dans un instant.',
                  en: 'Could not save. Please try again in a moment.',
                },
                locale
              )}
            </p>
          )}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {localize({ fr: 'Plus tard', en: 'Later' }, locale)}
          </button>

          {isUpgrade ? (
            <Link
              href={pricingHref}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 hover:opacity-90"
            >
              <span>{localize(copy.ctaLabel, locale)}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={notify}
              disabled={pending || isNotified}
              aria-live="polite"
              className={cn(
                'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer',
                isNotified
                  ? 'bg-success/10 text-success border border-success/30 cursor-default'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
                pending && 'opacity-70 cursor-wait'
              )}
            >
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : isNotified ? (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              ) : null}
              <span>
                {isNotified
                  ? localize({ fr: 'C’est noté', en: 'Noted' }, locale)
                  : localize(copy.ctaLabel, locale)}
              </span>
            </button>
          )}
        </div>

        {copy.ctaHint && !isUpgrade && !isNotified && (
          <p className="px-5 pb-4 -mt-2 text-[10px] text-muted-foreground/80">
            {localize(copy.ctaHint, locale)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Provider : un seul interstitiel pour toute l'app ─────────────────

interface FeatureAnnouncementContextValue {
  locale: FeatureLocale;
  open: (feature: FeatureKey) => void;
  close: () => void;
  activeFeature: FeatureKey | null;
  /** false hors provider : les badges restent alors de simples libellés. */
  available: boolean;
}

const FeatureAnnouncementContext = React.createContext<FeatureAnnouncementContextValue | null>(
  null
);

export interface FeatureAnnouncementProviderProps {
  children: React.ReactNode;
  locale?: FeatureLocale;
  pricingHref?: string;
  /**
   * Collecte les signaux d'intérêt (view/notify). L'appelant seul sait à
   * qui les attribuer : créateur personnel ou publication média.
   */
  onSignal?: (signal: FeatureSignal) => void | Promise<void>;
  /**
   * Demandes déjà enregistrées (relues côté serveur au montage) : l'annonce
   * affiche « c'est noté » d'emblée plutôt que de reproposer un clic.
   */
  notifiedFeatures?: ReadonlySet<FeatureKey>;
  /** Prévenir le porteur d'état qu'une demande locale vient d'aboutir. */
  onNotified?: (feature: FeatureKey) => void;
}

/**
 * Monte l'interstitiel unique de l'application. Les badges, teasers et
 * boutons « en savoir plus » ouvrent tous ce même écran.
 */
export function FeatureAnnouncementProvider({
  children,
  locale = DEFAULT_FEATURE_LOCALE,
  pricingHref,
  onSignal,
  notifiedFeatures,
  onNotified,
}: FeatureAnnouncementProviderProps) {
  const [activeFeature, setActiveFeature] = React.useState<FeatureKey | null>(null);
  // Les demandes déjà enregistrées survivent à la fermeture de l'annonce
  // (état local), et à un rechargement quand l'appelant le fournit.
  const [localNotified, setLocalNotified] = React.useState<ReadonlySet<FeatureKey>>(new Set());

  const value = React.useMemo<FeatureAnnouncementContextValue>(
    () => ({
      locale,
      open: (feature: FeatureKey) => setActiveFeature(feature),
      close: () => setActiveFeature(null),
      activeFeature,
      available: true,
    }),
    [locale, activeFeature]
  );

  return (
    <FeatureAnnouncementContext.Provider value={value}>
      {children}
      {activeFeature && (
        <FeatureInterstitial
          featureKey={activeFeature}
          open
          onOpenChange={(next) => {
            if (!next) setActiveFeature(null);
          }}
          locale={locale}
          pricingHref={pricingHref}
          onSignal={onSignal}
          notified={
            (notifiedFeatures?.has(activeFeature) ?? false) || localNotified.has(activeFeature)
          }
          onNotified={() => {
            setLocalNotified((prev) => {
              const next = new Set(prev);
              next.add(activeFeature);
              return next;
            });
            onNotified?.(activeFeature);
          }}
        />
      )}
    </FeatureAnnouncementContext.Provider>
  );
}

/**
 * Ouvre l'interstitiel depuis n'importe quel composant client.
 * Tolérant hors provider : `open` est alors un no-op plutôt qu'un crash,
 * pour que les stories et les aperçus isolés restent utilisables.
 */
export function useFeatureAnnouncement(): FeatureAnnouncementContextValue {
  const context = React.useContext(FeatureAnnouncementContext);
  if (context) return context;
  return {
    locale: DEFAULT_FEATURE_LOCALE,
    open: () => {},
    close: () => {},
    activeFeature: null,
    available: false,
  };
}
