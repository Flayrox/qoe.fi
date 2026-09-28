'use client';

// =====================================================================
// 🔐 Step-up — vérifier un facteur fort sans quitter son travail (Studio)
// =====================================================================
// Le garde d'autorisation Go refuse les actions sensibles quand la session
// n'a pas de preuve forte récente (`needs_step_up`) ou que le fournisseur l'a
// élevée par une méthode que qoe.fi n'autorise pas (`deny_weak_auth`, un code
// SMS par exemple). Sans ce module, l'utilisateur devait quitter la page,
// retrouver les réglages de sécurité, s'authentifier à nouveau — puis revenir
// et relancer l'action à la main.
//
// Ici : la vérification se fait **dans ce navigateur** (le jeton obtenu porte
// `aal2` et un `amr` « mfa/totp » horodaté, exactement ce que le garde Go
// accepte pour un N2 frais), et l'appelant rejoue automatiquement son action
// une fois la session élevée (voir `attemptWithStepUp` dans `lib/authz-feedback`).
//
// Pattern identique au `<Toaster />` : un store minimal (pub/sub) + un
// composant monté une fois dans le layout racine, et une fonction impérative
// (`requestStepUp`) appelable depuis n'importe quel composant client.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { authzSecurityHref } from '@qoe/sdk/actions/utils/authz';
import { createClient } from '@/lib/supabase/client';
import { TotpEnrollment } from './totp-enrollment';

interface StepUpRequest {
  id: number;
  reason?: string;
  resolve: (ok: boolean) => void;
}

let pending: StepUpRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Demande une vérification de facteur fort. Résout `true` quand la session du
 * navigateur est fortement authentifiée, `false` si l'utilisateur annule, n'a
 * pas de facteur compatible, ou si la vérification échoue.
 *
 * Une seule demande à la fois : une nouvelle demande annule la précédente.
 */
export function requestStepUp(reason?: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pending?.resolve(false);
    pending = { id: Date.now(), reason, resolve };
    emit();
  });
}

/** Facteurs TOTP déjà vérifiés, et si le compte a un facteur non vérifié. */
interface FactorState {
  totp: { id: string; label: string }[];
  hasUnverified: boolean;
}

// `data.totp` / `data.phone` ne contiennent que les facteurs **vérifiés** : les
// facteurs créés mais jamais confirmés vivent uniquement dans `data.all`. C'est
// exactement le cas qui laisse un compte bloqué sans explication, donc on lit
// `all` pour pouvoir le dire à l'utilisateur.
async function readFactors(): Promise<FactorState> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const totp = (data?.totp ?? []).map((factor) => ({
    id: factor.id,
    label: factor.friendly_name ?? factor.factor_type,
  }));
  const hasUnverified = (data?.all ?? []).some((factor) => factor.status !== 'verified');
  return { totp, hasUnverified };
}

type Phase = 'loading' | 'input' | 'no-factor' | 'enroll' | 'submitting';

export function StepUpGate() {
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [factors, setFactors] = useState<FactorState>({ totp: [], hasUnverified: false });
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const listener = () => setRequest(pending);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // À l'ouverture : on liste les facteurs pour savoir quoi proposer.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setPhase('loading');
    setErrorMessage(null);
    setCode('');
    readFactors()
      .then((state) => {
        if (cancelled) return;
        setFactors(state);
        setPhase(state.totp.length > 0 ? 'input' : 'no-factor');
      })
      .catch(() => {
        if (cancelled) return;
        setFactors({ totp: [], hasUnverified: false });
        setPhase('no-factor');
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const close = useCallback((ok: boolean) => {
    const current = pending;
    pending = null;
    emit();
    current?.resolve(ok);
  }, []);

  // Enrôlement demandé depuis la boîte de dialogue : l'utilisateur ne quitte
  // pas son travail, la session est élevée sur place, puis l'action est
  // rejouée par `attemptWithStepUp`. Avant, il partait dans un autre onglet et
  // devait relancer l'action lui-même — souvent il ne revenait pas.
  const handleEnrolled = useCallback(() => {
    close(true);
  }, [close]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const factorId = factors.totp[0]?.id;
      if (!factorId || code.trim().length === 0) return;
      setPhase('submitting');
      setErrorMessage(null);
      try {
        const supabase = createClient();
        // challenge + verify : la session du navigateur est mise à jour avec
        // un jeton `aal2` (et un `amr` horodaté) — le serveur lira ce jeton
        // au prochain appel d'action, d'où le rejeu automatique.
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: code.trim(),
        });
        if (error) throw new Error(error.message);
        close(true);
      } catch (err) {
        setPhase('input');
        setCode('');
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : 'Code refusé. Vérifiez l’horloge de votre appareil et réessayez.'
        );
      }
    },
    [code, factors.totp, close]
  );

  if (!request) return null;

  const securityHref = authzSecurityHref();

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-lg shadow-black/10">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="step-up-title" className="text-sm font-semibold text-popover-foreground">
              Vérification requise
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {request.reason ??
                'Cette action sensible demande une authentification forte récente.'}
            </p>
          </div>
        </div>

        {phase === 'loading' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Vérification de vos facteurs…
          </div>
        )}

        {phase === 'no-factor' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Aucun facteur fort compatible n’est enregistré sur ce compte. Une application
              d’authentification (TOTP) ou une passkey est nécessaire pour débloquer cette action —
              un code reçu par SMS ne compte pas.
            </p>
            {factors.hasUnverified && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Un facteur existe mais n’a jamais été vérifié : enregistrez-en un nouveau, ou
                supprimez l’ancien depuis vos réglages de sécurité.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPhase('enroll')}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Enregistrer un facteur maintenant
              </button>
              <a
                href={securityHref}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Gérer mes facteurs
              </a>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {phase === 'enroll' && (
          <div className="mt-4">
            <TotpEnrollment
              intro="Scannez ce QR code, puis saisissez le code affiché : l’action sera relancée automatiquement."
              onVerified={handleEnrolled}
              onCancel={() => setPhase('no-factor')}
            />
          </div>
        )}

        {(phase === 'input' || phase === 'submitting') && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                Code de votre application d’authentification
                {factors.totp[0]?.label ? (
                  <span className="text-muted-foreground"> · {factors.totp[0].label}</span>
                ) : null}
              </span>
              <input
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg font-semibold tracking-[0.3em] text-foreground outline-none focus:border-primary"
              />
            </label>

            {errorMessage && (
              <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={phase === 'submitting' || code.trim().length < 6}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {phase === 'submitting' && <Loader2 className="size-3.5 animate-spin" />}
                Vérifier
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
