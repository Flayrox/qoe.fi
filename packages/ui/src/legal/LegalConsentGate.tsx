'use client';

// =====================================================================
// ⚖️ LegalConsentGate — consentement obligatoire à la connexion
// =====================================================================
// Monté dans les layouts authentifiés (core = lecteurs, studio = créateurs) :
// dès qu'un document « à accepter » a une nouvelle version (ou qu'un nouveau
// document apparaît), l'utilisateur connecté doit confirmer explicitement.
// Chaque confirmation crée une preuve nominative (version exacte + date + IP
// côté API).
//
// « Plus tard » ferme pour la session en cours : l'utilisateur peut lire les
// textes sans être enfermé, mais le portail revient à la navigation suivante —
// l'acceptation ne peut pas être contournée durablement.
// =====================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Scale, ShieldCheck } from 'lucide-react';
import { recordLegalConsentAction } from '@qoe/sdk/actions/legal';

export interface ConsentItem {
  slug: string;
  title: string;
  version: string;
}

const COPY = {
  fr: {
    title: 'Mise à jour des conditions',
    intro:
      'Ces documents ont changé ou doivent être confirmés. Cochez chacun pour continuer — votre acceptation est horodatée et conservée.',
    read: 'Lire',
    accept: 'J’accepte et je continue',
    later: 'Plus tard',
    error: 'Consentement non enregistré',
    required: 'Tous les documents doivent être acceptés.',
  },
  en: {
    title: 'Terms update',
    intro:
      'These documents have changed or need to be confirmed. Tick each one to continue — your acceptance is timestamped and retained.',
    read: 'Read',
    accept: 'I accept and continue',
    later: 'Later',
    error: 'Consent not recorded',
    required: 'Every document must be accepted.',
  },
} as const;

export interface LegalConsentGateProps {
  pending: ConsentItem[];
  locale: string;
  /**
   * Base des pages légales publiques. Par défaut `/legal/` (les apps qui
   * servent elles-mêmes les documents) ; une app d'administration sans pages
   * légales peut pointer vers le site public.
   */
  hrefBase?: string;
}

export function LegalConsentGate({ pending, locale, hrefBase = '/legal' }: LegalConsentGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const copy = locale.startsWith('en') ? COPY.en : COPY.fr;
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ne jamais afficher la modale par-dessus les pages légales (/legal, /legal/[slug])
  // afin que l'utilisateur puisse lire les documents sans être bloqué par la pop-up.
  const isLegalPage = pathname?.includes('/legal');
  if (pending.length === 0 || dismissed || isLegalPage) return null;

  const base = hrefBase.replace(/\/+$/, '');
  const isExternal = /^https?:\/\//i.test(base);

  const remaining = pending.filter((item) => !checked.includes(item.slug));
  const allChecked = remaining.length === 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const results = await Promise.all(
        pending.map((item) =>
          recordLegalConsentAction({
            slug: item.slug,
            locale,
            source: 'consent-gate',
            method: 'explicit-modal',
          })
        )
      );
      const failure = results.find((result) => !result.success);
      if (failure) {
        setError(failure.error ?? copy.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <Scale className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.intro}</p>
          </div>
        </div>

        <ul className="max-h-[45vh] space-y-1 overflow-y-auto px-5 py-4">
          {pending.map((item) => {
            const href = `${base}/${item.slug}`;
            return (
              <li key={item.slug}>
                <label className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={checked.includes(item.slug)}
                    onChange={(event) =>
                      setChecked((previous) =>
                        event.target.checked
                          ? [...previous, item.slug]
                          : previous.filter((slug) => slug !== item.slug)
                      )
                    }
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      v{item.version}
                    </span>
                    {isExternal ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline"
                      >
                        {copy.read} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline"
                      >
                        {copy.read} <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="px-5 pb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!allChecked && <p className="px-5 pb-2 text-xs text-muted-foreground">{copy.required}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            onClick={() => setDismissed(true)}
            className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
          >
            {copy.later}
          </button>
          <button
            onClick={submit}
            disabled={!allChecked || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {copy.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
