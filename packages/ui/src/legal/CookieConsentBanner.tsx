'use client';

// =====================================================================
// 🍪 CookieConsentBanner — centre de préférences traceurs partagé
// =====================================================================
// Deux surfaces, un seul choix :
//   - la bande compacte (premier contact) : accepter / refuser / personnaliser,
//     avec « tout refuser » au même niveau visuel qu'« tout accepter » ;
//   - le centre de préférences (modale) : catégories expliquées, liste des
//     traceurs réellement déposés (registre partagé), et journalisation du
//     choix côté serveur.
//
// Contraintes tenues sur toutes les apps :
//   - aucun traceur non essentiel avant le choix (le cookie est relu côté
//     serveur par AnalyticsGate) ;
//   - le choix est modifiable à tout moment et retirable aussi facilement ;
//   - un choix = une preuve serveur, y compris pour un visiteur anonyme.
// =====================================================================

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Cookie, Lock, Settings2, ShieldCheck, X } from 'lucide-react';
import { recordCookieConsentAction } from '@qoe/sdk/actions/legal';
import {
  COOKIE_POLICY_SLUG,
  COOKIE_CATEGORIES,
  COOKIE_CONSENT_VERSION,
  acceptedOptionalCount,
  choiceToCategories,
  defaultChoice,
  localized,
  normalizeConsent,
  trackersByCategory,
  type CookieCategory,
  type CookieConsentChoice,
} from '@qoe/utils/cookie-consent';
import {
  readConsentId,
  readLocalConsent,
  subscribeCookiePreferences,
  writeConsent,
} from './cookie-consent-storage';

const COPY = {
  fr: {
    title: 'Votre choix sur les traceurs',
    body: 'Nous utilisons des traceurs strictement nécessaires (connexion, sécurité) sans consentement. La mesure d’audience et les préférences de confort ne sont activées qu’avec votre accord — et refuser est aussi simple qu’accepter. Détail dans la',
    policy: 'politique de cookies',
    acceptAll: 'Tout accepter',
    rejectAll: 'Tout refuser',
    save: 'Enregistrer mes choix',
    customize: 'Personnaliser',
    rejectLabel: 'Refuser les traceurs non essentiels',
    dialogLabel: 'Préférences de cookies',
    centerTitle: 'Préférences de traceurs',
    centerIntro:
      'Vous gardez la main, catégorie par catégorie. Votre choix est conservé 6 mois et peut être modifié à tout moment depuis « Gérer mes cookies ».',
    alwaysOn: 'Toujours actif',
    trackers: 'Traceurs de cette catégorie',
    purpose: 'Finalité',
    retention: 'Conservation',
    provider: 'Émetteur',
    noTrackers: 'Aucun traceur déposé pour cette catégorie.',
    saved: 'Choix enregistré',
    savedHint: 'Vos préférences sont appliquées immédiatement et journalisées côté serveur.',
    journaled: 'Preuve enregistrée',
    close: 'Fermer',
    summaryNone: 'Aucun traceur non essentiel',
    summaryCount: (n: number) => `${n} catégorie${n > 1 ? 's' : ''} activée${n > 1 ? 's' : ''}`,
    firstParty: 'Première partie',
    thirdParty: 'Tiers',
  },
  en: {
    title: 'Your tracker choices',
    body: 'We use strictly necessary trackers (sign-in, security) without consent. Audience measurement and comfort preferences are only enabled with your agreement — and refusing is as easy as accepting. Details in the',
    policy: 'cookie policy',
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    save: 'Save my choices',
    customize: 'Customise',
    rejectLabel: 'Reject non-essential trackers',
    dialogLabel: 'Cookie preferences',
    centerTitle: 'Tracker preferences',
    centerIntro:
      'You stay in control, category by category. Your choice is kept for 6 months and can be changed at any time via “Manage my cookies”.',
    alwaysOn: 'Always on',
    trackers: 'Trackers in this category',
    purpose: 'Purpose',
    retention: 'Retention',
    provider: 'Set by',
    noTrackers: 'No tracker is set for this category.',
    saved: 'Choice saved',
    savedHint: 'Your preferences apply immediately and are logged server-side.',
    journaled: 'Proof recorded',
    close: 'Close',
    summaryNone: 'No non-essential tracker',
    summaryCount: (n: number) => `${n} categor${n > 1 ? 'ies' : 'y'} enabled`,
    firstParty: 'First party',
    thirdParty: 'Third party',
  },
} as const;

interface CookieConsentBannerProps {
  locale: string;
  policyVersion?: string;
  /** Le registre des traceurs est affiché dans le centre (défaut : oui). */
  showTrackers?: boolean;
}

export function CookieConsentBanner({
  locale,
  policyVersion,
  showTrackers = true,
}: CookieConsentBannerProps) {
  const router = useRouter();
  const copy = locale.startsWith('en') ? COPY.en : COPY.fr;
  const [visible, setVisible] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [choice, setChoice] = useState<CookieConsentChoice>(
    () => normalizeConsent(defaultChoice()) ?? defaultChoice()
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    const stored = readLocalConsent();
    setVisible(stored === null);
    if (stored) setChoice(stored);
    return subscribeCookiePreferences(() => {
      const current = readLocalConsent();
      if (current) setChoice(current);
      setCenterOpen(true);
      setVisible(false);
    });
  }, []);

  function decide(next: CookieConsentChoice) {
    const wasBanner = visible;
    const normalized = { ...next, decidedAt: new Date().toISOString() };
    writeConsent(normalized);
    setChoice(normalized);
    setSaved(true);
    setVisible(false);
    setCenterOpen(false);

    // 🧾 Preuve serveur : un choix de traceurs doit être journalisé même pour
    // un visiteur sans compte — c'est justement le cas de l'immense majorité
    // des visites. On ne bloque jamais l'interface là-dessus.
    void recordCookieConsentAction({
      consentId: readConsentId(),
      locale,
      policyVersion: normalized.version || COOKIE_CONSENT_VERSION,
      categories: choiceToCategories(normalized),
      source: 'cookie-banner',
    }).catch(() => {});

    startTransition(() => router.refresh());
    if (wasBanner) setTimeout(() => setSaved(false), 3200);
  }

  function toggle(category: CookieCategory, value: boolean) {
    setChoice((previous) => ({ ...previous, [category]: value }));
  }

  const optionalCount = acceptedOptionalCount(choice);

  return (
    <>
      {saved && !centerOpen && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[65] -translate-x-1/2 rounded-xl border border-border bg-card/95 px-4 py-2.5 text-xs font-medium shadow-lg backdrop-blur-md"
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" />
            {copy.saved}
            <span className="text-muted-foreground">
              · {optionalCount === 0 ? copy.summaryNone : copy.summaryCount(optionalCount)}
            </span>
          </span>
        </div>
      )}

      {visible && !centerOpen && (
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
              <button
                onClick={() => setCenterOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground underline hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {copy.customize}
              </button>
            </div>
          </div>
        </div>
      )}

      {centerOpen && (
        <CookiePreferencesCenter
          locale={locale}
          choice={choice}
          policyVersion={policyVersion}
          showTrackers={showTrackers}
          onToggle={toggle}
          onSave={() => decide(choice)}
          onAcceptAll={() =>
            decide({ ...choice, analytics: true, functional: true, marketing: false })
          }
          onRejectAll={() =>
            decide({ ...choice, analytics: false, functional: false, marketing: false })
          }
          onClose={() => setCenterOpen(false)}
        />
      )}
    </>
  );
}

// ─── Centre de préférences ───────────────────────────────────────────

interface CookiePreferencesCenterProps {
  locale: string;
  choice: CookieConsentChoice;
  policyVersion?: string;
  showTrackers?: boolean;
  onToggle: (category: CookieCategory, value: boolean) => void;
  onSave: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
}

/**
 * Centre de préférences par catégories. Exporté séparément pour qu'une page
 * (ou un écran de réglages) puisse l'ouvrir sans passer par la bande.
 */
export function CookiePreferencesCenter({
  locale,
  choice,
  policyVersion,
  showTrackers = true,
  onToggle,
  onSave,
  onAcceptAll,
  onRejectAll,
  onClose,
}: CookiePreferencesCenterProps) {
  const copy = locale.startsWith('en') ? COPY.en : COPY.fr;
  const [expanded, setExpanded] = useState<CookieCategory | null>('analytics');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.centerTitle}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">{copy.centerTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.centerIntro}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={copy.close}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {COOKIE_CATEGORIES.map((category) => {
            const trackers = trackersByCategory(category.key);
            const isOpen = expanded === category.key;
            return (
              <section
                key={category.key}
                className="overflow-hidden rounded-2xl border border-border"
              >
                <div className="flex items-start gap-3 px-3 py-3">
                  <label className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {category.locked ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={
                          category.key === 'necessary' ? true : Boolean(choice[category.key])
                        }
                        onChange={(event) => onToggle(category.key, event.target.checked)}
                        className="h-4 w-4"
                        aria-label={localized(category.label, locale)}
                      />
                    )}
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {localized(category.label, locale)}
                      {category.locked && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {copy.alwaysOn}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {localized(category.description, locale)}
                    </p>
                    {showTrackers && trackers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : category.key)}
                        aria-expanded={isOpen}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline"
                      >
                        {copy.trackers} ({trackers.length})
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {showTrackers && isOpen && (
                  <ul className="space-y-2 border-t border-border bg-muted/30 px-3 py-3">
                    {trackers.length === 0 && (
                      <li className="text-[11px] text-muted-foreground">{copy.noTrackers}</li>
                    )}
                    {trackers.map((tracker) => (
                      <li
                        key={tracker.name}
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-[11px] font-semibold text-foreground">
                            {tracker.name}
                          </code>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {tracker.firstParty ? copy.firstParty : copy.thirdParty}
                          </span>
                          {tracker.href && (
                            <Link
                              href={tracker.href}
                              className="text-[10px] font-semibold text-primary underline"
                            >
                              {copy.provider}
                            </Link>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/80">{copy.provider} :</span>{' '}
                          {tracker.provider}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/80">{copy.purpose} :</span>{' '}
                          {localized(tracker.purpose, locale)}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/80">{copy.retention} :</span>{' '}
                          {localized(tracker.retention, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            <Link
              href={`/legal/${COOKIE_POLICY_SLUG}`}
              className="font-semibold text-primary underline"
            >
              {copy.policy}
            </Link>
            {policyVersion ? ` (version ${policyVersion})` : ''} · {copy.savedHint}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onSave}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            {copy.save}
          </button>
          <button
            onClick={onAcceptAll}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {copy.acceptAll}
          </button>
          <button
            onClick={onRejectAll}
            className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground underline hover:text-foreground"
          >
            {copy.rejectAll}
          </button>
        </div>
      </div>
    </div>
  );
}
