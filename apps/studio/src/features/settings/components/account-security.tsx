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
  getAccountSecurityEventsAction,
  getAccountSecurityIdentityAction,
  getAccountSecuritySessionsAction,
  requestAccountSecurityDeletionAction,
  revokeAllAccountSessionsAction,
  revokeOtherAccountSessionsAction,
  updateAccountConsentAction,
  type SecurityEventItem,
} from '../actions';
import { MfaPanel } from './mfa-panel';
import { t } from '@lingui/core/macro';

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
  const [securityEvents, setSecurityEvents] = useState<SecurityEventItem[]>([]);
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
    getAccountSecurityEventsAction()
      .then((r) => setSecurityEvents(Array.isArray(r.events) ? r.events : []))
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
      toast.success(t`Export téléchargé.`);
    } catch {
      toast.error(t`Impossible de générer l’export.`);
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    if (deletionConfirmation !== 'DELETE') return;
    setBusy(true);
    try {
      await requestAccountSecurityDeletionAction();
      toast.success(t`Demande de suppression enregistrée.`);
      setDeletionConfirmation('');
    } catch {
      toast.error(t`Impossible d’enregistrer la demande.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-security" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t`Compte & sécurité`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t`Gérez votre compte personnel et vos données. Le profil public se modifie depuis votre profil.`}
        </p>
      </div>

      <div
        id="account-identity"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-3"
      >
        <h3 className="font-semibold">{t`Identité`}</h3>
        <div className="text-sm text-muted-foreground">
          <p>
            {t`Email :`} <strong className="text-foreground">{identity.email}</strong>{' '}
          </p>
          <p>
            {t`Username :`}{' '}
            <strong className="text-foreground">
              {profile.username ? `@${profile.username}` : t`Non défini`}
            </strong>
          </p>
        </div>
        <Button asChild variant="ghost" tone="brand" size="sm" className="-ml-2 w-fit">
          <a href={URLS.CONSOLE}>
            {t`Modifier mon profil public`} <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
      </div>

      <div
        id="account-password"
        className="rounded-xl border border-border/50 bg-card p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">{t`Authentification`}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t`Les actions sensibles demandent le mot de passe actuel et déclenchent la vérification côté fournisseur d’identité.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            placeholder={t`Mot de passe actuel`}
            aria-label={t`Mot de passe actuel`}
            size="sm"
          />
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder={t`Nouvel email`}
            aria-label={t`Nouvel email`}
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
                toast.success(t`Un email de vérification a été envoyé.`);
                setNewEmail('');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t`Impossible de changer l’email.`);
              } finally {
                setBusy(false);
              }
            }}
            className="justify-start"
          >
            {t`Changer l’email`}
          </Button>
          <Input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder={t`Nouveau mot de passe`}
            aria-label={t`Nouveau mot de passe`}
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
                toast.success(t`Mot de passe modifié.`);
                setNewPassword('');
                setCurrentPassword('');
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : t`Impossible de changer le mot de passe.`
                );
              } finally {
                setBusy(false);
              }
            }}
            className="justify-start"
          >
            {t`Changer le mot de passe`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setMfaBusy(true);
              try {
                await revokeOtherAccountSessionsAction();
                setSessions(sessions.filter((s) => s.current));
                toast.success(t`Les autres sessions ont été révoquées.`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t`Révocation impossible.`);
              } finally {
                setMfaBusy(false);
              }
            }}
            disabled={mfaBusy || sessions.length < 2}
            className="justify-start"
          >
            {t`Révoquer les autres sessions (`}
            {sessions.length})
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
                toast.success(t`Toutes les sessions OAuth ont été révoquées.`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t`Révocation impossible.`);
              } finally {
                setMfaBusy(false);
              }
            }}
            disabled={mfaBusy || sessions.length === 0}
            className="justify-start"
          >
            {t`Révoquer toutes les sessions OAuth`}
          </Button>
        </div>
        <div
          id="security-sessions"
          className="pt-2 border-t border-border/40 text-xs text-muted-foreground"
        >
          {t`Sessions actives détectées :`} {sessions.length}
        </div>
      </div>

      <MfaPanel />

      <div id="security-audit" className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">{t`Historique de sécurité`}</h3>
        <p className="text-sm text-muted-foreground">
          {t`Journal des connexions depuis un nouvel environnement et des opérations sensibles (mot de passe, email, 2FA, clés API, quarantaine).`}
        </p>
        {securityEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`Aucun événement enregistré récemment.`}</p>
        ) : (
          <ul className="divide-y divide-border/40 text-sm">
            {securityEvents.slice(0, 15).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{formatSecurityEventLabel(ev.eventType)}</p>
                  {(ev.ipSubnet || ev.userAgent) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[ev.ipSubnet, ev.userAgent].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">{t`Consentements`}</h3>
        <p className="text-sm text-muted-foreground">
          {t`Contrôlez les traitements facultatifs. Les traitements nécessaires restent actifs.`}
        </p>
        {(['analytics', 'personalization', 'marketing'] as const).map((key) => (
          <Checkbox
            key={key}
            isSelected={consent[key]}
            onChange={(isSelected) => setConsent({ ...consent, [key]: isSelected })}
            label={
              key === 'analytics'
                ? t`Mesure d’audience`
                : key === 'personalization'
                  ? t`Personnalisation`
                  : t`Marketing`
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
              toast.success(t`Préférences de consentement enregistrées.`);
            } catch {
              toast.error(t`Impossible d’enregistrer le consentement.`);
            }
          }}
        >
          {t`Enregistrer mes choix`}
        </Button>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h3 className="font-semibold">{t`Mes données`}</h3>
        <p className="text-sm text-muted-foreground">
          {t`Téléchargez une copie des données associées à votre compte.`}
        </p>
        <Button
          variant="solid"
          tone="brand"
          size="sm"
          loading={busy}
          onClick={exportData}
          className="w-fit"
        >
          <Download aria-hidden /> {t`Exporter mes données`}
        </Button>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h3 className="font-semibold text-destructive-text">{t`Zone dangereuse`}</h3>
        <p className="text-sm text-muted-foreground">
          {t`La suppression est différée et peut être annulée pendant le délai de grâce.`}
        </p>
        <Input
          value={deletionConfirmation}
          onChange={(event) => setDeletionConfirmation(event.target.value)}
          placeholder={t`Écrivez DELETE`}
          aria-label={t`Confirmation de suppression`}
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
          <Trash2 aria-hidden /> {t`Demander la suppression`}
        </Button>
      </div>
    </section>
  );
}

const SECURITY_EVENT_LABELS = (): Record<string, string> => ({
  login_new_device: t`Nouvelle connexion détectée`,
  password_changed: t`Mot de passe modifié`,
  email_changed: t`Changement d’adresse email demandé`,
  mfa_enrolled: t`Double authentification (TOTP) activée`,
  mfa_removed: t`Double authentification (TOTP) supprimée`,
  api_key_created: t`Clé API créée`,
  api_key_rotated: t`Clé API régénérée`,
  api_key_revoked: t`Clé API révoquée`,
  api_key_quarantined: t`Clé API placée en lecture seule`,
  publisher_api_quarantined: t`API de publication placée en lecture seule`,
});

function formatSecurityEventLabel(eventType: string): string {
  return SECURITY_EVENT_LABELS()[eventType] ?? eventType;
}
