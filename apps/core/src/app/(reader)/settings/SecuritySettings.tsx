'use client';

import { useCallback, useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { createClient } from '@qoe/supabase/client';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Check, Copy, Link2, LogOut, ShieldCheck, Trash2 } from 'lucide-react';

const supabase = createClient();

type Factor = { id: string; friendly_name?: string | null; factor_type: string; status: string };
type Identity = { id?: string; provider: string; identity_data?: { email?: string } | null };

export default function SecuritySettings() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(
    null
  );
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: mfa, error: mfaError }, { data: identityData, error: identityError }] =
      await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getUserIdentities()]);
    if (mfaError) setError(mfaError.message);
    if (identityError) setError(identityError.message);
    setFactors((mfa?.all ?? []) as Factor[]);
    setIdentities((identityData?.identities ?? []) as Identity[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEnrollment = async () => {
    setBusy(true);
    setError(null);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'qoefi',
    });
    setBusy(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    if (data?.id && data.totp?.qr_code && data.totp.secret) {
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    }
  };

  const verifyEnrollment = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollment.id,
    });
    if (challengeError || !challenge?.id) {
      setBusy(false);
      setError(challengeError?.message ?? t`Impossible de démarrer la vérification.`);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setEnrollment(null);
    setCode('');
    setMessage(t`Authentification à deux facteurs activée.`);
    await load();
  };

  const removeFactor = async (factorId: string) => {
    if (!window.confirm(t`Supprimer ce facteur d’authentification ?`)) return;
    setBusy(true);
    setError(null);
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (removeError) {
      setError(removeError.message);
      return;
    }
    setMessage(t`Facteur supprimé.`);
    await load();
  };

  const linkProvider = async (provider: string) => {
    setBusy(true);
    setError(null);
    const { data, error: linkError } = await supabase.auth.linkIdentity({
      provider: provider as 'google' | 'apple',
    });
    setBusy(false);
    if (linkError) setError(linkError.message);
    else if (data?.url) window.location.assign(data.url);
  };

  const globalSignOut = async () => {
    if (!window.confirm(t`Déconnecter toutes les sessions Supabase ?`)) return;
    setBusy(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    setBusy(false);
    if (signOutError) setError(signOutError.message);
    else window.location.assign('/login');
  };

  const verified = factors.filter((factor) => factor.status === 'verified');
  const copySecret = async () => {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section className="space-y-5">
      <header className="border-b border-border pb-5">
        <h2 className="text-2xl font-bold tracking-tight">{t`Sécurité`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t`Protégez votre compte et contrôlez vos accès.`}</p>
      </header>
      {message && (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm text-success-text">
          <Check className="h-4 w-4" />
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t`Chargement…`}</p>
      ) : (
        <>
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">{t`Authentification à deux facteurs`}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t`Utilisez une application TOTP pour renforcer votre connexion.`}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t`GoTrue ne fournit pas encore de codes de récupération. Ajoutez un second facteur TOTP sur un autre appareil comme solution de secours.`}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {verified.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between rounded-control bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span>{factor.friendly_name || 'TOTP'}</span>
                    <Badge tone="success" variant="soft" size="xs">
                      {t`Vérifié`}
                    </Badge>
                  </span>
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="xs"
                    shape="icon"
                    disabled={busy}
                    onClick={() => removeFactor(factor.id)}
                    aria-label={t`Supprimer ce facteur`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            {!enrollment && (
              <Button
                variant="solid"
                tone="brand"
                size="sm"
                disabled={busy}
                onClick={beginEnrollment}
                className="mt-4"
              >
                {t`Ajouter un facteur TOTP`}
              </Button>
            )}
            {enrollment && (
              <div className="mt-4 space-y-3 rounded-panel bg-muted/30 p-3">
                <p className="text-xs">{t`Scannez ce QR code avec votre application d’authentification.`}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr)}`}
                  alt={t`QR code TOTP`}
                  className="h-40 w-40 rounded bg-white p-2"
                />
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-xs">{enrollment.secret}</p>
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="icon"
                    onClick={copySecret}
                    aria-label={t`Copier le secret TOTP`}
                  >
                    {copied ? <Check className="text-success-text" /> : <Copy />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    size="sm"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="solid"
                    tone="brand"
                    size="sm"
                    disabled={busy || code.length !== 6}
                    onClick={verifyEnrollment}
                  >
                    {t`Vérifier`}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-panel border border-border/60 p-4">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">{t`Fournisseurs connectés`}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t`Les fournisseurs liés ne donnent jamais accès à vos tokens.`}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {identities.map((identity) => (
                <Badge key={`${identity.provider}-${identity.id}`} variant="outline" shape="pill">
                  {identity.provider}
                </Badge>
              ))}
              {!identities.some((identity) => identity.provider === 'google') && (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => linkProvider('google')}
                >
                  {t`Lier Google`}
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-panel border border-destructive/25 bg-destructive/[0.03] p-4">
            <div className="flex items-start gap-3">
              <LogOut className="mt-0.5 h-5 w-5 text-destructive-text" />
              <div>
                <h3 className="font-semibold text-destructive-text">{t`Sessions natives Supabase`}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t`Déconnecte tous les appareils gérés par Supabase Auth.`}</p>
              </div>
            </div>
            <Button
              variant="outline"
              tone="danger"
              size="sm"
              disabled={busy}
              onClick={globalSignOut}
              className="mt-4"
            >
              {t`Déconnecter tous les appareils`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
