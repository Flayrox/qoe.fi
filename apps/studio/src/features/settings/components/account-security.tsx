'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import { Input } from '@qoe/ui/input';
import { toast } from '@qoe/ui/toast';
import { URLS } from '@qoe/config';
import {
  changeAccountSecurityEmailAction,
  changeAccountSecurityPasswordAction,
  exportAccountSecurityDataAction,
  getAccountSecurityConsentAction,
  getAccountSecurityIdentityAction,
  getAccountSecuritySessionsAction,
  requestAccountSecurityDeletionAction,
  revokeAllAccountSessionsAction,
  revokeOtherAccountSessionsAction,
  updateAccountConsentAction,
} from '../actions';
import { MfaPanel } from './mfa-panel';

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
    getAccountSecuritySessionsAction()
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined);
    getAccountSecurityConsentAction()
      .then(setConsent)
      .catch(() => undefined);
  }, []);

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
        <Button asChild variant="ghost" tone="brand" size="sm" className="-ml-2 w-fit">
          <a href={URLS.CONSOLE}>
            Modifier mon profil public <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
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
          <Input
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            placeholder="Mot de passe actuel"
            aria-label="Mot de passe actuel"
            size="sm"
          />
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="Nouvel email"
            aria-label="Nouvel email"
            size="sm"
          />
          <Button
            variant="outline"
            size="sm"
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
            className="justify-start"
          >
            Changer l’email
          </Button>
          <Input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="Nouveau mot de passe"
            aria-label="Nouveau mot de passe"
            size="sm"
          />
          <Button
            variant="outline"
            size="sm"
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
            className="justify-start"
          >
            Changer le mot de passe
          </Button>
          <Button
            variant="outline"
            size="sm"
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
            className="justify-start"
          >
            Révoquer les autres sessions ({sessions.length})
          </Button>
          <Button
            variant="outline"
            tone="danger"
            size="sm"
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
            className="justify-start"
          >
            Révoquer toutes les sessions OAuth
          </Button>
        </div>
      </div>

      <MfaPanel />

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">Consentements</h3>
        <p className="text-sm text-muted-foreground">
          Contrôlez les traitements facultatifs. Les traitements nécessaires restent actifs.
        </p>
        {(['analytics', 'personalization', 'marketing'] as const).map((key) => (
          <Checkbox
            key={key}
            isSelected={consent[key]}
            onChange={(isSelected) => setConsent({ ...consent, [key]: isSelected })}
            label={
              key === 'analytics'
                ? 'Mesure d’audience'
                : key === 'personalization'
                  ? 'Personnalisation'
                  : 'Marketing'
            }
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={async () => {
            try {
              await updateAccountConsentAction(consent);
              toast.success('Préférences de consentement enregistrées.');
            } catch {
              toast.error('Impossible d’enregistrer le consentement.');
            }
          }}
        >
          Enregistrer mes choix
        </Button>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">Mes données</h3>
        <p className="text-sm text-muted-foreground">
          Téléchargez une copie des données associées à votre compte.
        </p>
        <Button
          variant="solid"
          tone="brand"
          size="sm"
          loading={busy}
          onClick={exportData}
          className="w-fit"
        >
          <Download aria-hidden /> Exporter mes données
        </Button>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h3 className="font-semibold text-destructive-text">Zone dangereuse</h3>
        <p className="text-sm text-muted-foreground">
          La suppression est différée et peut être annulée pendant le délai de grâce.
        </p>
        <Input
          value={deletionConfirmation}
          onChange={(event) => setDeletionConfirmation(event.target.value)}
          placeholder="Écrivez DELETE"
          aria-label="Confirmation de suppression"
          size="sm"
        />
        <Button
          variant="solid"
          tone="danger"
          size="sm"
          onClick={requestDeletion}
          disabled={busy || deletionConfirmation !== 'DELETE'}
          className="w-fit"
        >
          <Trash2 aria-hidden /> Demander la suppression
        </Button>
      </div>
    </section>
  );
}
