'use client';

import { useState } from 'react';
import { Download, ExternalLink, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { URLS } from '@qoe/config';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface AccountSecurityProfile {
  email: string;
  username: string | null;
  hasCompletedOnboarding: boolean;
  advancedSettingsMode?: boolean;
}

export function AccountSecurity({ profile }: { profile: AccountSecurityProfile }) {
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const data = await goFetch<Record<string, unknown>>('/v1/me/data-export');
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
      await goFetch('/v1/me/account-deletion-request', { method: 'POST' });
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
            Email : <strong className="text-foreground">{profile.email}</strong>
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
          Les changements d’email, de mot de passe et la MFA seront branchés à l’API Go et à
          Supabase auto-hébergé. Cette section est prête à recevoir ces contrôles.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button disabled className="rounded-lg border px-3 py-2 text-left text-sm opacity-60">
            Changer l’email — bientôt disponible
          </button>
          <button disabled className="rounded-lg border px-3 py-2 text-left text-sm opacity-60">
            Changer le mot de passe — bientôt disponible
          </button>
          <button disabled className="rounded-lg border px-3 py-2 text-left text-sm opacity-60">
            Activer la MFA — bientôt disponible
          </button>
          <button disabled className="rounded-lg border px-3 py-2 text-left text-sm opacity-60">
            Sessions actives — bientôt disponible
          </button>
        </div>
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
