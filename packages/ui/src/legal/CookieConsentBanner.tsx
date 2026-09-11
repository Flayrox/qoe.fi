'use client';

// =====================================================================
// 🍪 CookieConsentBanner — consentement traceurs (refus aussi simple)
// =====================================================================
// Exigences tenues, sur toutes les apps :
//   - « Tout refuser » est un bouton unique, au même niveau visuel ;
//   - aucun traceur non essentiel n'est chargé avant le choix : le
//     cookie de consentement est relu côté serveur (AnalyticsGate) ;
//   - le choix peut être modifié à tout moment (« Gérer mes cookies ») ;
//   - le choix est tracé (date + version) et rattaché au compte quand
//     le lecteur est connecté (preuve de consentement).
// =====================================================================

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { recordLegalConsentAction } from '@qoe/sdk/actions/legal';
import {
  COOKIE_POLICY_SLUG,
  defaultChoice,
  normalizeConsent,
  type CookieConsentChoice,
} from '@qoe/utils/cookie-consent';
import {
  readLocalConsent,
  subscribeCookiePreferences,
  writeConsent,
} from './cookie-consent-storage';

const COPY = {
  fr: {
    title: 'Votre choix sur les traceurs',
    body: 'Nous utilisons des traceurs strictement nécessaires (connexion, sécurité) sans consentement. La mesure d’audience et les préférences de confort ne sont activées qu’avec votre accord — et refuser est aussi simple qu’accepter. Détail dans la',
    policy: 'politique de cookies',
    analytics: 'Mesure d’audience',
    analyticsHint: 'Comptage anonymisé des visites, statistiques des créateurs.',
    functional: 'Préférences de confort',
    functionalHint: 'Langue, devise, taille de police, lecteur audio.',
    marketing: 'Publicité',
    marketingHint: 'Aucune publicité comportementale sur qoe.fi. Rien à désactiver.',
    acceptAll: 'Tout accepter',
    rejectAll: 'Tout refuser',
    save: 'Enregistrer mes choix',
    customize: 'Personnaliser',
    rejectLabel: 'Refuser les traceurs non essentiels',
    dialogLabel: 'Préférences de cookies',
  },
  en: {
    title: 'Your tracker choices',
    body: 'We use strictly necessary trackers (sign-in, security) without consent. Audience measurement and comfort preferences are only enabled with your agreement — and refusing is as easy as accepting. Details in the',
    policy: 'cookie policy',
    analytics: 'Audience measurement',
    analyticsHint: 'Anonymised visit counting, creator statistics.',
    functional: 'Comfort preferences',
    functionalHint: 'Language, currency, font size, audio player.',
    marketing: 'Advertising',
    marketingHint: 'No behavioural advertising on qoe.fi. Nothing to switch off.',
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    save: 'Save my choices',
    customize: 'Customise',
    rejectLabel: 'Reject non-essential trackers',
    dialogLabel: 'Cookie preferences',
  },
} as const;

interface CookieConsentBannerProps {
  locale: string;
  policyVersion?: string;
}

export function CookieConsentBanner({ locale, policyVersion }: CookieConsentBannerProps) {
  const router = useRouter();
  const copy = locale.startsWith('en') ? COPY.en : COPY.fr;
  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [choice, setChoice] = useState<CookieConsentChoice>(
    () =>
      normalizeConsent({ ...defaultChoice(), decidedAt: new Date().toISOString() }) ??
      defaultChoice()
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    setVisible(readLocalConsent() === null);
    return subscribeCookiePreferences(() => {
      const stored = readLocalConsent();
      if (stored) setChoice(stored);
      setCustomize(true);
      setVisible(true);
    });
  }, []);

  function decide(next: CookieConsentChoice) {
    writeConsent(next);
    setVisible(false);
    setCustomize(false);
    // Le consentement traceur est aussi une preuve côté plateforme : on
    // l'enregistre pour les comptes connectés (silencieux si anonyme).
    void recordLegalConsentAction({
      slug: COOKIE_POLICY_SLUG,
      locale,
      source: 'cookie-banner',
      method: next.analytics || next.functional ? 'accept' : 'refuse',
    }).catch(() => {});
    startTransition(() => router.refresh());
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={copy.dialogLabel}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 px-4 py-5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <Cookie className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{copy.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.body}{' '}
              <Link
                href={`/legal/${COOKIE_POLICY_SLUG}`}
                className="underline transition-colors hover:text-primary"
              >
                {copy.policy}
              </Link>
              {policyVersion ? ` (version ${policyVersion})` : ''}.
            </p>
          </div>
          <button
            onClick={() =>
              decide({ ...choice, analytics: false, functional: false, marketing: false })
            }
            aria-label={copy.rejectLabel}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {customize && (
          <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3">
            <label className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={choice.analytics}
                onChange={(event) => setChoice({ ...choice, analytics: event.target.checked })}
                className="mt-1 h-4 w-4"
              />
              <span className="text-xs">
                <span className="font-semibold">{copy.analytics}</span>
                <span className="mt-0.5 block text-muted-foreground">{copy.analyticsHint}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={choice.functional}
                onChange={(event) => setChoice({ ...choice, functional: event.target.checked })}
                className="mt-1 h-4 w-4"
              />
              <span className="text-xs">
                <span className="font-semibold">{copy.functional}</span>
                <span className="mt-0.5 block text-muted-foreground">{copy.functionalHint}</span>
              </span>
            </label>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2 opacity-70">
              <ShieldCheck className="mt-0.5 h-4 w-4" />
              <span className="text-xs">
                <span className="font-semibold">{copy.marketing}</span>
                <span className="mt-0.5 block text-muted-foreground">{copy.marketingHint}</span>
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              decide({ ...choice, analytics: true, functional: true, marketing: false })
            }
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            {copy.acceptAll}
          </button>
          <button
            onClick={() =>
              decide({ ...choice, analytics: false, functional: false, marketing: false })
            }
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {copy.rejectAll}
          </button>
          {customize ? (
            <button
              onClick={() => decide({ ...choice, decidedAt: new Date().toISOString() })}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground underline hover:text-foreground"
            >
              {copy.save}
            </button>
          ) : (
            <button
              onClick={() => setCustomize(true)}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground underline hover:text-foreground"
            >
              {copy.customize}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
