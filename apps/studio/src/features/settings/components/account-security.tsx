'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { URLS } from '@qoe/config';
import {
  changeAccountSecurityEmailAction,
  changeAccountSecurityPasswordAction,
  enrollAccountSecurityMfaAction,
  exportAccountSecurityDataAction,
  getAccountSecurityConsentAction,
  getAccountSecurityIdentityAction,
  getAccountSecurityMfaAction,
  getAccountSecuritySessionsAction,
  requestAccountSecurityDeletionAction,
  revokeAllAccountSessionsAction,
  revokeOtherAccountSessionsAction,
  updateAccountConsentAction,
} from '../actions';

export interface AccountSecurityProfile {
  email: string;
  username: string | null;
  hasCompletedOnboarding: boolean;
  advancedSettingsMode?: boolean;
}

export function AccountSecurity({ profile }: { profile: AccountSecurityProfile }) {
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState(profile);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [mfaFactors, setMfaFactors] = useState<Record<string, unknown> | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{ id: string; clientId: string; current: boolean }>
  >([]);
  const [consent, setConsent] = useState({
    analytics: false,
    personalization: false,
    marketing: false,
    version: '1',
  });

  useEffect(() => {
    getAccountSecurityIdentityAction()
      .then((result) => setIdentity((current) => ({ ...current, email: result.email })))
      .catch(() => undefined);
    getAccountSecurityMfaAction()
      .then(setMfaFactors)
      .catch(() => undefined);
    getAccountSecuritySessionsAction()
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined);
    getAccountSecurityConsentAction()
      .then(setConsent)
      .catch(() => undefined);
  }, []);

  async function enrollMfa() {
    setMfaBusy(true);
    try {
      const result = await enrollAccountSecurityMfaAction();
      setMfaFactors(result);
      toast.success('Scannez le QR code avec votre application d’authentification.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'MFA indisponible.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const data = await exportAccountSecurityDataAction();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `qoe-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé.');
    } catch {
      toast.error('Impossible de générer l’export.');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    if (deletionConfirmation !== 'DELETE') return;
    setBusy(true);
    try {
      await requestAccountSecurityDeletionAction();
      toast.success('Demande de suppression enregistrée.');
      setDeletionConfirmation('');
    } catch {
      toast.error('Impossible d’enregistrer la demande.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-security" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Compte & sécurité</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez votre compte personnel et vos données. Le profil public se modifie depuis votre
          profil.
        </p>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">Identité</h3>
        <div className="text-sm text-muted-foreground">
          <p>
            Email : <strong className="text-foreground">{identity.email}</strong>{' '}
          </p>
          <p>
            Username :{' '}
            <strong className="text-foreground">
              {profile.username ? `@${profile.username}` : 'Non défini'}
            </strong>
          </p>
        </div>
        <a
          href={URLS.CONSOLE}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          Modifier mon profil public <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Authentification</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Les actions sensibles demandent le mot de passe actuel et déclenchent la vérification côté
          fournisseur d’identité.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            placeholder="Mot de passe actuel"
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="Nouvel email"
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={busy || !newEmail || !currentPassword}
            onClick={async () => {
              setBusy(true);
              try {
                await changeAccountSecurityEmailAction(newEmail, currentPassword);
                toast.success('Un email de vérification a été envoyé.');
                setNewEmail('');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Impossible de changer l’email.');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50"
          >
            Changer l’email
          </button>
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="Nouveau mot de passe"
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={busy || !newPassword || !currentPassword}
            onClick={async () => {
              setBusy(true);
              try {
                await changeAccountSecurityPasswordAction(newPassword, currentPassword);
                toast.success('Mot de passe modifié.');
                setNewPassword('');
                setCurrentPassword('');
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : 'Impossible de changer le mot de passe.'
                );
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50"
          >
            Changer le mot de passe
          </button>
          <button
            disabled={mfaBusy}
            onClick={enrollMfa}
            className="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50"
          >
            {mfaFactors ? 'MFA configurée — gérer le facteur' : 'Activer la MFA'}
          </button>
          <button
            onClick={async () => {
              setMfaBusy(true);
              try {
                await revokeOtherAccountSessionsAction();
                setSessions(sessions.filter((s) => s.current));
                toast.success('Les autres sessions ont été révoquées.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Révocation impossible.');
              } finally {
                setMfaBusy(false);
              }
            }}
            disabled={mfaBusy || sessions.length < 2}
            className="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50"
          >
            Révoquer les autres sessions ({sessions.length})
          </button>
          <button
            onClick={async () => {
              setMfaBusy(true);
              try {
                await revokeAllAccountSessionsAction();
                setSessions([]);
                toast.success('Toutes les sessions OAuth ont été révoquées.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Révocation impossible.');
              } finally {
                setMfaBusy(false);
              }
            }}
            disabled={mfaBusy || sessions.length === 0}
            className="rounded-lg border px-3 py-2 text-left text-sm text-destructive disabled:opacity-50"
          >
            Révoquer toutes les sessions OAuth
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">Consentements</h3>
        <p className="text-sm text-muted-foreground">
          Contrôlez les traitements facultatifs. Les traitements nécessaires restent actifs.
        </p>
        {(['analytics', 'personalization', 'marketing'] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent[key]}
              onChange={(e) => setConsent({ ...consent, [key]: e.target.checked })}
            />{' '}
            {key === 'analytics'
              ? 'Mesure d’audience'
              : key === 'personalization'
                ? 'Personnalisation'
                : 'Marketing'}
          </label>
        ))}
        <button
          onClick={async () => {
            try {
              await updateAccountConsentAction(consent);
              toast.success('Préférences de consentement enregistrées.');
            } catch {
              toast.error('Impossible d’enregistrer le consentement.');
            }
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Enregistrer mes choix
        </button>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">Mes données</h3>
        <p className="text-sm text-muted-foreground">
          Téléchargez une copie des données associées à votre compte.
        </p>
        <button
          onClick={exportData}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Exporter mes données
        </button>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h3 className="font-semibold text-destructive">Zone dangereuse</h3>
        <p className="text-sm text-muted-foreground">
          La suppression est différée et peut être annulée pendant le délai de grâce.
        </p>
        <input
          value={deletionConfirmation}
          onChange={(event) => setDeletionConfirmation(event.target.value)}
          placeholder="Écrivez DELETE"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={requestDeletion}
          disabled={busy || deletionConfirmation !== 'DELETE'}
          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> Demander la suppression
        </button>
      </div>
    </section>
  );
}
