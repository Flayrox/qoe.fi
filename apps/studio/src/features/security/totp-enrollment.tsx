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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Callout } from '@qoe/ui/callout';
import { Icon } from '@qoe/ui/icons';
import { Input } from '@qoe/ui/input';
import { Spinner } from '@qoe/ui/spinner';
import { toast } from '@qoe/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { enrollAccountSecurityMfaAction } from '@/features/settings/actions';
import { sanitizeInlineSvg } from '@/lib/sanitize-inline-svg';
import { t } from '@lingui/core/macro';

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
  // Un SVG contenant du code n'est jamais affiché : le secret et le lien
  // otpauth:// restent disponibles en repli.
  const safeQrCode = useMemo(() => sanitizeInlineSvg(qrCode), [qrCode]);

  const start = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const result = await enrollAccountSecurityMfaAction();
      if (!result?.id) throw new Error(t`Le fournisseur d’identité n’a pas renvoyé de facteur.`);
      setActiveFactorId(result.id);
      setQrCode(result.totp?.qr_code ?? null);
      setSecret(result.totp?.secret ?? null);
      setUri(result.totp?.uri ?? null);
      setCode('');
      setPhase('input');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t`Impossible de créer le facteur pour le moment.`
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
      setErrorMessage(t`Saisissez les 6 chiffres affichés par votre application.`);
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
          : t`Code refusé. Vérifiez l’horloge de votre appareil et réessayez.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t`${label} copié.`);
    } catch {
      toast.error(t`Copie impossible : sélectionnez le texte à la main.`);
    }
  }

  if (phase === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" label={t`Préparation du facteur`} />
        {t`Préparation du facteur…`}
      </p>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-3">
        <Callout tone="danger" live>
          {errorMessage}
        </Callout>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void start()}>
            <Icon name="refresh" />
            {t`Réessayer`}
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t`Fermer`}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {intro && <p className="text-xs leading-relaxed text-muted-foreground">{intro}</p>}

      {safeQrCode ? (
        <div
          className="mx-auto w-44 [&_svg]:h-full [&_svg]:w-full"
          // GoTrue renvoie un SVG prêt à afficher : on ne le reconstruit pas,
          // mais on refuse tout contenu actif (script, gestionnaire inline).
          dangerouslySetInnerHTML={{ __html: safeQrCode }}
        />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t`Ajoutez le compte à la main dans votre application d’authentification, avec le secret ci-dessous.`}
        </p>
      )}

      {secret && (
        <div className="flex items-center justify-between gap-2 rounded-control bg-muted/40 px-3 py-2">
          <code className="truncate font-mono text-xs">{secret}</code>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => copy(secret, t`Secret`)}
            className="shrink-0"
          >
            <Icon name="copy" size="sm" />
            {t`Copier`}
          </Button>
        </div>
      )}

      {uri && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => copy(uri, t`Lien otpauth`)}
          className="justify-start px-0 text-primary hover:bg-transparent hover:underline"
        >
          {t`Copier le lien otpauth://`}
        </Button>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t`Code à 6 chiffres`}</span>
        <Input
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          aria-label={t`Code à 6 chiffres`}
          className="max-w-40 text-center text-lg font-semibold tracking-[0.3em]"
        />
      </label>

      {errorMessage && (
        <Callout tone="danger" live>
          {errorMessage}
        </Callout>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="solid"
          tone="brand"
          size="sm"
          loading={busy}
          disabled={code.length < 6}
        >
          {t`Vérifier`}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t`Annuler`}
          </Button>
        )}
      </div>
    </form>
  );
}
