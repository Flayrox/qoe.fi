'use client';

// =====================================================================
// 🔐 Step-up — vérifier un facteur fort sans quitter son travail (console)
// =====================================================================
// Le garde de la console (apps/api/internal/adminauthz) refuse les actes
// lourds quand la session n'a pas de preuve forte récente (`needs_step_up`) ou
// que le fournisseur l'a élevée par une méthode que qoe.fi n'autorise pas
// (`deny_weak_auth` — un code SMS, par exemple). Depuis la Phase 3, distribuer
// un rôle, révoquer les sessions d'un compte, exporter la conformité ou publier
// un texte juridique demandent cette preuve.
//
// Sans ce module, la personne devait quitter sa page, retrouver ses réglages de
// sécurité, s'authentifier à nouveau — puis revenir ressaisir son formulaire.
// Ici, la vérification se fait DANS ce navigateur (le jeton obtenu porte `aal2`
// et un `amr` horodaté, exactement ce que le garde Go accepte pour un N2 frais)
// et l'appelant rejoue automatiquement son action une fois la session élevée
// (voir `attemptWithStepUp` dans `@/lib/authz-feedback`) : aucune saisie n'est
// perdue.
//
// Pattern identique au `<Toaster />` et au Studio : un store minimal (pub/sub)
// + un composant monté une fois dans le layout de la console, et une fonction
// impérative (`requestStepUp`) appelable depuis n'importe quel composant client.
//
// L'enrôlement TOTP vit ici plutôt que dans les réglages du compte : la console
// d'administration n'a pas d'écran de sécurité, et envoyer un membre du staff
// s'enrôler ailleurs lui ferait perdre l'action en cours. Le parcours reste le
// même que partout ailleurs : créer le facteur, montrer le QR code ET le secret,
// puis vérifier le code DEPUIS LE NAVIGATEUR — seul cet échange met à jour la
// session courante. Une vérification côté serveur validerait le facteur mais
// laisserait la session en `aal1`, donc toujours refusée.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { createClient } from '@/lib/supabase/client';

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
 * navigateur est fortement authentifiée, `false` si la personne annule, n'a pas
 * de facteur compatible, ou si la vérification échoue.
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

// `data.totp` ne contient que les facteurs VÉRIFIÉS ; les facteurs créés mais
// jamais confirmés vivent dans `data.all`. C'est le cas qui laisse un compte
// bloqué sans explication : on lit `all` pour pouvoir le dire.
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

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const factorId = factors.totp[0]?.id;
      if (!factorId || code.trim().length === 0) return;
      setPhase('submitting');
      setErrorMessage(null);
      try {
        const supabase = createClient();
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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
      data-testid="step-up-dialog"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-white p-6 shadow-2xl text-foreground">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#EE4B2B]/10 text-[#EE4B2B]">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="step-up-title" className="text-sm font-semibold">
              Vérification requise
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {request.reason ??
                'Cet acte sensible demande une authentification forte récente (moins de 10 minutes).'}
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
              d’authentification (TOTP) est nécessaire pour débloquer cet acte — un code reçu par
              SMS ne compte pas.
            </p>
            {factors.hasUnverified && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Un facteur existe mais n’a jamais été vérifié : enrôlez-en un nouveau.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPhase('enroll')}
                data-testid="step-up-enroll"
                className="rounded-xl bg-[#EE4B2B] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              >
                Enregistrer un facteur maintenant
              </button>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {phase === 'enroll' && (
          <TotpEnrollment onVerified={() => close(true)} onCancel={() => setPhase('no-factor')} />
        )}

        {(phase === 'input' || phase === 'submitting') && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">
                Code de votre application d’authentification
                {factors.totp[0]?.label ? (
                  <span className="text-muted-foreground"> · {factors.totp[0].label}</span>
                ) : null}
              </span>
              <input
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                data-testid="step-up-code"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-lg font-semibold tracking-[0.3em] outline-none focus:border-[#EE4B2B]"
              />
            </label>

            {errorMessage && (
              <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={phase === 'submitting' || code.trim().length < 6}
                data-testid="step-up-submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#EE4B2B] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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

/**
 * Enrôlement TOTP en trois temps : créer le facteur (côté navigateur, avec la
 * session courante), montrer le QR code ET le secret, puis vérifier le code —
 * c'est cette dernière étape qui élève la session.
 */
function TotpEnrollment({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'input' | 'error'>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `qoefi-admin-${Date.now()}`,
      });
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error('Le fournisseur d’identité n’a pas renvoyé de facteur.');
      setFactorId(data.id);
      setQrCode(data.totp?.qr_code ?? null);
      setSecret(data.totp?.secret ?? null);
      setCode('');
      setPhase('input');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Impossible de créer le facteur pour le moment.'
      );
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || code.length < 6) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error(error.message);
      onVerified();
    } catch (error) {
      setCode('');
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Code refusé. Vérifiez l’horloge de votre appareil et réessayez.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié.`);
    } catch {
      toast.error('Copie impossible : sélectionnez le texte à la main.');
    }
  }

  if (phase === 'loading') {
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Préparation du facteur…
      </p>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-xl border border-border px-3 py-2 text-xs cursor-pointer"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-3 py-2 text-xs cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Scannez ce QR code, puis saisissez le code affiché : l’action sera relancée automatiquement.
      </p>

      {qrCode ? (
        <div
          className="mx-auto w-40 [&_svg]:h-full [&_svg]:w-full"
          // GoTrue renvoie un SVG prêt à afficher : on ne le reconstruit pas.
          dangerouslySetInnerHTML={{ __html: qrCode }}
        />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Ajoutez le compte à la main dans votre application d’authentification, avec le secret
          ci-dessous.
        </p>
      )}

      {secret && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
          <code className="truncate font-mono text-xs">{secret}</code>
          <button
            type="button"
            onClick={() => copy(secret, 'Secret')}
            data-testid="step-up-copy-secret"
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Copy className="size-3.5" /> Copier
          </button>
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Code à 6 chiffres</span>
        <input
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          data-testid="step-up-enroll-code"
          className="w-full max-w-[10rem] rounded-xl border border-border bg-background px-3 py-2 text-center text-lg font-semibold tracking-[0.3em] outline-none focus:border-[#EE4B2B]"
        />
      </label>

      {errorMessage && <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || code.length < 6}
          data-testid="step-up-enroll-submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[#EE4B2B] px-3 py-2 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />} Vérifier
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-3 py-2 text-xs cursor-pointer"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
