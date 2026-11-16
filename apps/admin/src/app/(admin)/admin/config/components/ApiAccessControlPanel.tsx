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
// =====================================================================

import { useState } from 'react';
import {
  setApiAccessDisabledAction,
  saveApiDisabledEndpointsAction,
} from '@/lib/admin-aux-actions';
import { attemptWithStepUp, readMessage } from '@/lib/authz-feedback';
import { Button } from '@qoe/ui/button';
import { Callout } from '@qoe/ui/callout';
import { Icon } from '@qoe/ui/icons';
import { SectionHeader } from '@qoe/ui/section-header';
import { StatusDot } from '@qoe/ui/status-dot';
import { Textarea } from '@qoe/ui/input';

interface ApiAccessControlPanelProps {
  initialDisabled: boolean;
  initialEndpoints: string[];
}

export function ApiAccessControlPanel({
  initialDisabled,
  initialEndpoints,
}: ApiAccessControlPanelProps) {
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
      // La coupure générale de l'API exige une preuve forte récente (N2) : le
      // refus ouvre la vérification de facteur, puis l'action est rejouée telle
      // quelle — le bouton n'a rien à ressaisir.
      const res = await attemptWithStepUp(() => setApiAccessDisabledAction(!disabled));
      if (res.success) {
        setDisabled(!disabled);
        setKillMsg(
          !disabled
            ? 'Coupure générale ACTIVÉE : toute l’API refuse les requêtes (appliquée en ~5 s).'
            : 'Coupure générale désactivée : l’API répond à nouveau.'
        );
      } else {
        setKillMsg(readMessage(res) ?? 'Erreur.');
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
      const res = await attemptWithStepUp(() => saveApiDisabledEndpointsAction(patterns));
      if (res.success) {
        setEndpointsText((res.patterns ?? []).join('\n'));
        setEndpointsMsg(
          res.patterns && res.patterns.length > 0
            ? `${res.patterns.length} endpoint(s) désactivé(s) — appliqué en ~5 s.`
            : 'Aucun endpoint désactivé.'
        );
      } else {
        setEndpointsMsg(readMessage(res) ?? 'Erreur.');
      }
    } finally {
      setSavingEndpoints(false);
    }
  }

  return (
    <section className="space-y-6 border-y border-border py-8">
      <SectionHeader
        eyebrow="Infrastructure"
        title="Contrôle d’accès global de l’API"
        description="Coupure générale et désactivation d’endpoints, appliquées côté serveur Go : un flag client ne bloquerait pas les requêtes directes. La console admin, l’IdP OAuth et les webhooks entrants infra restent toujours joignables."
        icon={<Icon name="server" />}
        meta={disabled ? 'coupée' : 'en service'}
      />

      {/* Coupure générale */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border/60 bg-card p-4">
        <div className="flex items-start gap-3">
          <span
            className={
              disabled
                ? 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-destructive/15 text-destructive-text'
                : 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-muted text-muted-foreground'
            }
          >
            <Icon name="circle-alert" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {disabled ? 'API coupée (maintenance)' : 'API en service'}
              <StatusDot tone={disabled ? 'danger' : 'success'} />
            </p>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
              En cas d’incident ou de maintenance, coupez toute l’API d’un coup : les requêtes
              répondent 503, les accès par clé API sont refusés, les permissions par créateur
              restent intactes (tout reprend à la réactivation).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          tone={disabled ? 'success' : 'danger'}
          loading={savingKill}
          onClick={() => void handleToggleKillSwitch()}
        >
          <Icon name="zap" />
          {disabled ? 'Réactiver l’API' : 'Couper l’API'}
        </Button>
      </div>
      {killMsg && (
        <Callout tone={killMsg.includes('ACTIVÉE') ? 'danger' : 'success'} live>
          {killMsg}
        </Callout>
      )}

      {/* Endpoints désactivés */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="server" size="sm" className="text-muted-foreground" />
          <p className="text-sm font-semibold">Endpoints désactivés (préfixes de chemins)</p>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Un préfixe couvre le chemin et tous ses sous-chemins (ex.{' '}
          <code className="tabular-nums text-[11px]">/v1/articles</code> bloque{' '}
          <code className="tabular-nums text-[11px]">/v1/articles/123</code>). Un endpoint désactivé
          répond 404 pour tout le monde (sauf console admin). Un par ligne.
        </p>
        <Textarea
          value={endpointsText}
          onChange={(e) => {
            setEndpointsText(e.target.value);
            setEndpointsMsg(null);
          }}
          rows={5}
          placeholder={'/v1/articles\n/v1/webhooks\n/v1/search/semantic'}
          aria-label="Endpoints désactivés"
          className="max-w-2xl font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            loading={savingEndpoints}
            onClick={() => void handleSaveEndpoints()}
          >
            Enregistrer les endpoints
          </Button>
          {endpointsMsg && (
            <Callout tone={endpointsMsg.includes('Erreur') ? 'danger' : 'success'} live>
              {endpointsMsg}
            </Callout>
          )}
        </div>
        {endpointsText.split('\n').some((p) => p.trim() && !p.trim().startsWith('/')) && (
          <p className="flex items-center gap-1.5 text-xs text-destructive-text">
            <Icon name="triangle-alert" size="sm" />
            Les chemins doivent commencer par « / » (les lignes invalides seront ignorées).
          </p>
        )}
      </div>
    </section>
  );
}
