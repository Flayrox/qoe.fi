'use client';

// =====================================================================
// 📊 AnalyticsNotice — l'avis qui remplace la bannière, sans rien bloquer
// =====================================================================
// La mesure d'audience est anonyme et sans cookie : elle est dispensée de
// consentement. Il n'y a donc plus de choix à recueillir avant d'afficher la
// page, et une bannière bloquante ne serait plus qu'un obstacle décoratif
// (le pire des deux mondes : elle gêne sans rien protéger).
//
// Ce qui subsiste, en revanche, c'est le droit de s'opposer. Cet avis le rend
// exerçable en un clic, sans modale ni cases à cocher :
//   - « M'y opposer » coupe la mesure côté navigateur (umami.disabled) ET
//     l'éteint côté serveur (cookie de choix relu par AnalyticsGate), puis
//     journalise la décision ;
//   - « En savoir plus » ouvre le centre de préférences complet, où figurent
//     le registre des traceurs et la base de la dispense.
//
// L'avis disparaît dès qu'une décision existe (opposition ou simple prise de
// connaissance) : il informe une fois, il ne harcèle pas.
// =====================================================================

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Check, ShieldOff, X } from 'lucide-react';
import { recordCookieConsentAction } from '@qoe/sdk/actions/legal';
import {
  COOKIE_POLICY_SLUG,
  COOKIE_CONSENT_VERSION,
  EXEMPT_ANALYTICS_NOTICE,
  choiceToCategories,
  defaultChoice,
  localized,
  type CookieConsentChoice,
} from '@qoe/utils/cookie-consent';
import {
  openCookiePreferences,
  readConsentId,
  readLocalConsent,
  writeConsent,
} from './cookie-consent-storage';

interface AnalyticsNoticeProps {
  locale: string;
  policyVersion?: string;
  /** Ouvre le centre de préférences hébergé par le parent, s'il y en a un. */
  onOpenCenter?: () => void;
}

export function AnalyticsNotice({ locale, policyVersion, onOpenCenter }: AnalyticsNoticeProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [toast, setToast] = useState('');
  const [, startTransition] = useTransition();

  // Un avis n'est affiché qu'en l'absence de décision : dès qu'un choix existe
  // (même ancien), la personne a été informée et on ne la sollicite plus.
  useEffect(() => {
    setVisible(readLocalConsent() === null);
  }, []);

  function persist(choice: CookieConsentChoice, source: string, objection: boolean) {
    const normalized = { ...choice, decidedAt: new Date().toISOString() };
    writeConsent(normalized);
    setVisible(false);

    // 🧾 La trace côté serveur vaut pour un visiteur sans compte — c'est-à-dire
    // pour presque toutes les visites. Elle porte la version de politique
    // affichée, donc la preuve de l'information délivrée.
    void recordCookieConsentAction({
      consentId: readConsentId(),
      locale,
      policyVersion: normalized.version || COOKIE_CONSENT_VERSION,
      categories: choiceToCategories(normalized),
      source,
    }).catch(() => {});

    startTransition(() => router.refresh());
    setToast(
      localized(
        objection ? EXEMPT_ANALYTICS_NOTICE.objectionSaved : EXEMPT_ANALYTICS_NOTICE.restore,
        locale
      )
    );
    setTimeout(() => setToast(''), 3600);
  }

  const copy = EXEMPT_ANALYTICS_NOTICE;
  const l = (text: { fr: string; en: string }) => localized(text, locale);

  return (
    <>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[65] -translate-x-1/2 rounded-xl border border-border bg-card/95 px-4 py-2.5 text-xs font-medium shadow-lg backdrop-blur-md"
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" />
            {toast}
          </span>
        </div>
      )}

      {visible && (
        <div
          role="region"
          aria-label={l(copy.title)}
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur-md sm:inset-x-auto sm:left-4 sm:bottom-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{l(copy.title)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {l(copy.body)}{' '}
                <Link
                  href={`/legal/${COOKIE_POLICY_SLUG}`}
                  className="underline transition-colors hover:text-primary"
                >
                  {l(copy.learnMore)}
                </Link>
                {policyVersion ? ` (v${policyVersion})` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    persist(
                      { ...defaultChoice(), analytics: false, functional: false, marketing: false },
                      'exempt-objection',
                      true
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  {l(copy.object)}
                </button>
                <button
                  type="button"
                  onClick={() => (onOpenCenter ? onOpenCenter() : openCookiePreferences())}
                  className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-muted-foreground underline hover:text-foreground"
                >
                  {l(copy.learnMore)}
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label={l(copy.dismissed)}
              onClick={() => persist(defaultChoice(), 'exempt-notice', false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
