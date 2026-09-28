'use client';

// =====================================================================
// 🔑 Enrôlement TOTP — brique partagée
// =====================================================================
// Deux endroits ont besoin du même parcours :
//   • les réglages du compte, pour équiper son compte à l'avance ;
//   • la boîte de dialogue de refus (step-up), parce qu'envoyer l'utilisateur
//     vers une autre page lui faisait perdre son action en cours.
//
// Le parcours en trois temps, toujours le même :
//   1. créer le facteur (côté Go, qui numérote le nom pour ne pas se heurter à
//      un facteur non vérifié resté d'une tentative précédente) ;
//   2. montrer le QR code ET le secret (ajout manuel possible) ;
//   3. vérifier le code **depuis le navigateur** : seul cet échange met à jour
//      la session courante avec un jeton `aal2` + `amr` horodaté, ce que lit
//      le garde Go. Une vérification côté serveur validerait le facteur mais
//      laisserait la session en `aal1` — donc toujours refusée.
//
// `factorId` permet de reprendre un facteur déjà créé mais jamais confirmé
// (son secret n'est plus disponible : on peut seulement saisir un code).
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { enrollAccountSecurityMfaAction } from '@/features/settings/actions';

type Phase = 'loading' | 'input' | 'error';

interface Props {
  /** Facteur existant à confirmer. Absent : on en crée un. */
  factorId?: string;
  /** Appelé après un code accepté : la session du navigateur est `aal2`. */
  onVerified: () => void;
  /** Appelé sur « Annuler ». */
  onCancel?: () => void;
  /** Message d'introduction optionnel. */
  intro?: string;
}

export function TotpEnrollment({ factorId, onVerified, onCancel, intro }: Props) {
  const [phase, setPhase] = useState<Phase>(factorId ? 'input' : 'loading');
  const [activeFactorId, setActiveFactorId] = useState<string | null>(factorId ?? null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const result = await enrollAccountSecurityMfaAction();
      if (!result?.id) throw new Error('Le fournisseur d’identité n’a pas renvoyé de facteur.');
      setActiveFactorId(result.id);
      setQrCode(result.totp?.qr_code ?? null);
      setSecret(result.totp?.secret ?? null);
      setUri(result.totp?.uri ?? null);
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
    if (factorId) return;
    void start();
  }, [factorId, start]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!activeFactorId) return;
    if (code.length < 6) {
      setErrorMessage('Saisissez les 6 chiffres affichés par votre application.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: activeFactorId,
        code,
      });
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Préparation du facteur…
      </p>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Réessayer
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {intro && <p className="text-xs leading-relaxed text-muted-foreground">{intro}</p>}

      {qrCode ? (
        <div
          className="mx-auto w-44 [&_svg]:h-full [&_svg]:w-full"
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
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <code className="truncate font-mono text-xs">{secret}</code>
          <button
            type="button"
            onClick={() => copy(secret, 'Secret')}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" /> Copier
          </button>
        </div>
      )}

      {uri && (
        <button
          type="button"
          onClick={() => copy(uri, 'Lien otpauth')}
          className="text-xs text-primary hover:underline"
        >
          Copier le lien otpauth://
        </button>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Code à 6 chiffres</span>
        <input
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="w-full max-w-[10rem] rounded-lg border bg-background px-3 py-2 text-center text-lg font-semibold tracking-[0.3em]"
        />
      </label>

      {errorMessage && <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Vérifier
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-2 text-sm">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
