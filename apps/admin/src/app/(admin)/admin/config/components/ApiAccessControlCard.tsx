'use client';

// =====================================================================
// 🛑 Contrôle d'accès global de l'API — coupure générale + endpoints
// =====================================================================
// Deux leviers pilotés par le superadmin, appliqués côté serveur Go :
//   - Coupure générale (API_ACCESS_DISABLED) : toute l'API refuse les
//     requêtes (503), sauf la console admin, l'IdP OAuth, les webhooks
//     entrants infra et les événements internes.
//   - Endpoints désactivés (API_DISABLED_ENDPOINTS) : liste de préfixes
//     de chemins (ex. /v1/articles) qui répondent 404 partout.
// Les modifications sont prises en compte au runtime en ~5 s, sans
// re-déploiement.

import { useState } from 'react';
import {
  setApiAccessDisabledAction,
  saveApiDisabledEndpointsAction,
} from '@/lib/admin-aux-actions';
import { cn } from '@qoe/utils';
import { Power, Route, AlertTriangle } from 'lucide-react';

interface ApiAccessControlCardProps {
  initialDisabled: boolean;
  initialEndpoints: string[];
}

export function ApiAccessControlCard({
  initialDisabled,
  initialEndpoints,
}: ApiAccessControlCardProps) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [endpointsText, setEndpointsText] = useState(initialEndpoints.join('\n'));
  const [savingKill, setSavingKill] = useState(false);
  const [savingEndpoints, setSavingEndpoints] = useState(false);
  const [killMsg, setKillMsg] = useState<string | null>(null);
  const [endpointsMsg, setEndpointsMsg] = useState<string | null>(null);

  async function handleToggleKillSwitch() {
    setSavingKill(true);
    setKillMsg(null);
    try {
      const res = await setApiAccessDisabledAction(!disabled);
      if (res.success) {
        setDisabled(!disabled);
        setKillMsg(
          !disabled
            ? 'Coupure générale ACTIVÉE : toute l’API refuse les requêtes (appliquée en ~5 s).'
            : 'Coupure générale désactivée : l’API répond à nouveau.'
        );
      } else {
        setKillMsg(res.error ?? 'Erreur.');
      }
    } finally {
      setSavingKill(false);
    }
  }

  async function handleSaveEndpoints() {
    const patterns = endpointsText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    setSavingEndpoints(true);
    setEndpointsMsg(null);
    try {
      const res = await saveApiDisabledEndpointsAction(patterns);
      if (res.success) {
        setEndpointsText((res.patterns ?? []).join('\n'));
        setEndpointsMsg(
          res.patterns && res.patterns.length > 0
            ? `${res.patterns.length} endpoint(s) désactivé(s) — appliqué en ~5 s.`
            : 'Aucun endpoint désactivé.'
        );
      } else {
        setEndpointsMsg(res.error ?? 'Erreur.');
      }
    } finally {
      setSavingEndpoints(false);
    }
  }

  return (
    <section className="space-y-6 border-y border-border py-8">
      <div>
        <h2 className="text-xl font-semibold">Contrôle d’accès global de l’API</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Coupure générale et désactivation d’endpoints, appliquées <strong>côté serveur</strong>{' '}
          (clés <code className="font-mono text-xs">API_ACCESS_DISABLED</code> /{' '}
          <code className="font-mono text-xs">API_DISABLED_ENDPOINTS</code>) : un flag client ne
          bloquerait pas les requêtes directes. La console admin, l’IdP OAuth et les webhooks
          entrants infra restent toujours joignables.
        </p>
      </div>

      {/* Coupure générale */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              disabled ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
            )}
          >
            <Power className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {disabled ? 'API coupée (maintenance)' : 'API en service'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 max-w-xl">
              En cas d’incident ou de maintenance, coupez toute l’API d’un coup : les requêtes
              répondent 503, les accès par clé API sont refusés, les permissions par créateur
              restent intactes (tout reprend à la réactivation).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleKillSwitch}
          disabled={savingKill}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
            disabled
              ? 'bg-success/15 text-success hover:bg-success/25'
              : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          )}
        >
          {savingKill ? '…' : disabled ? 'Réactiver l’API' : 'Couper l’API'}
        </button>
      </div>
      {killMsg && (
        <p
          className={cn(
            'text-xs font-medium',
            killMsg.includes('ACTIVÉE') ? 'text-destructive' : 'text-success'
          )}
        >
          {killMsg}
        </p>
      )}

      {/* Endpoints désactivés */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Endpoints désactivés (préfixes de chemins)</p>
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
          Un préfixe couvre le chemin et tous ses sous-chemins (ex.{' '}
          <code className="font-mono text-[11px]">/v1/articles</code> bloque{' '}
          <code className="font-mono text-[11px]">/v1/articles/123</code>). Un endpoint désactivé
          répond 404 pour tout le monde (sauf console admin). Un par ligne.
        </p>
        <textarea
          value={endpointsText}
          onChange={(e) => {
            setEndpointsText(e.target.value);
            setEndpointsMsg(null);
          }}
          rows={5}
          placeholder={'/v1/articles\n/v1/webhooks\n/v1/search/semantic'}
          className="w-full max-w-2xl rounded-xl border border-border bg-muted/30 px-3 py-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveEndpoints}
            disabled={savingEndpoints}
            className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-border disabled:opacity-50"
          >
            {savingEndpoints ? 'Sauvegarde…' : 'Enregistrer les endpoints'}
          </button>
          {endpointsMsg && (
            <span
              className={cn(
                'text-xs font-medium',
                endpointsMsg.includes('Erreur') ? 'text-destructive' : 'text-success'
              )}
            >
              {endpointsMsg}
            </span>
          )}
        </div>
        {endpointsText.split('\n').some((p) => p.trim() && !p.trim().startsWith('/')) && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" />
            Les chemins doivent commencer par « / » (les lignes invalides seront ignorées).
          </p>
        )}
      </div>
    </section>
  );
}
