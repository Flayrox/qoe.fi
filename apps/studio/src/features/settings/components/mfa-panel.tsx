'use client';

// =====================================================================
// 🔐 Facteurs d'authentification forte (Studio → Compte & sécurité)
// =====================================================================
// Le garde Go refuse les actions sensibles (`api_keys:manage`, envoi de
// campagne, gestion des membres…) sans preuve forte récente. Encore
// fallait-il pouvoir en enregistrer une : l'écran précédent se contentait
// d'appeler l'inscription et d'afficher « Scannez le QR code »… sans jamais
// afficher de QR code ni proposer la saisie du code. Résultat : un facteur
// créé, jamais vérifié, qui ne débloquait rien — et qui bloquait même les
// tentatives suivantes (nom déjà pris côté GoTrue).
//
// Cet écran ne fait que la gestion : lire les facteurs, en ajouter un, en
// retirer un, et reprendre la confirmation d'un facteur resté non vérifié.
// L'enrôlement lui-même vit dans `features/security/totp-enrollment` pour être
// partagé avec la boîte de dialogue de refus.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { TotpEnrollment } from '@/features/security/totp-enrollment';
import {
  getAccountSecurityMfaAction,
  unenrollAccountSecurityMfaAction,
  type MfaFactorInfo,
} from '../actions';

export function MfaPanel() {
  const [factors, setFactors] = useState<MfaFactorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** `null` = fermé, `''` = nouveau facteur, sinon l'id d'un facteur à confirmer. */
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getAccountSecurityMfaAction();
      const all = (data as { all?: unknown }).all;
      setFactors(Array.isArray(all) ? (all as MfaFactorInfo[]) : []);
    } catch {
      // Fournisseur d'identité injoignable : on n'invente pas d'état.
      setFactors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verified = factors.filter((factor) => factor.status === 'verified');
  const unverified = factors.filter((factor) => factor.status !== 'verified');

  async function removeFactor(factorId: string, label: string) {
    if (!window.confirm(`Retirer le facteur « ${label} » ?`)) return;
    setBusy(true);
    try {
      await unenrollAccountSecurityMfaAction(factorId);
      toast.success('Facteur retiré.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Retrait impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Authentification forte</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Une application d’authentification (TOTP) ou une passkey est exigée avant les actions
        sensibles : clés d’API, envoi de campagne, gestion des membres. Un code reçu par SMS ne
        suffit pas.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lecture de vos facteurs…
        </p>
      ) : (
        <div className="space-y-2">
          {verified.map((factor) => (
            <div
              key={factor.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <Check className="h-4 w-4 text-success" />
                {factor.friendly_name || 'Facteur'} · {factor.factor_type ?? 'totp'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeFactor(factor.id, factor.friendly_name || 'facteur')}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Retirer
              </button>
            </div>
          ))}

          {unverified.map((factor) => (
            <div
              key={factor.id}
              className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  « {factor.friendly_name || 'Facteur'} » a été créé mais jamais vérifié : il ne
                  débloque aucune action.
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEnrolling(factor.id)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
                >
                  Saisir un code
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeFactor(factor.id, factor.friendly_name || 'facteur')}
                  className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
                >
                  Supprimer
                </button>
              </span>
            </div>
          ))}

          {factors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun facteur enregistré : les actions sensibles resteront refusées.
            </p>
          )}
        </div>
      )}

      {enrolling === null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setEnrolling('')}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {verified.length > 0 ? 'Ajouter un autre facteur' : 'Activer l’authentification forte'}
        </button>
      )}

      {enrolling !== null && (
        <div className="rounded-lg border border-border/60 p-3">
          <TotpEnrollment
            factorId={enrolling || undefined}
            intro={
              enrolling
                ? 'Saisissez un code pour confirmer ce facteur resté non vérifié.'
                : 'Scannez ce QR code avec votre application d’authentification, puis saisissez le code affiché.'
            }
            onVerified={() => {
              toast.success('Authentification forte activée.');
              setEnrolling(null);
              void refresh();
            }}
            onCancel={() => setEnrolling(null)}
          />
        </div>
      )}
    </div>
  );
}
