'use client';

import React, { useState } from 'react';
import { openAbuseIncidentAction, updateAbuseIncidentAction } from '@qoe/sdk/actions/admin';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { EmptyState } from '@qoe/ui/empty-state';
import { Icon } from '@qoe/ui/icons';
import { Input } from '@qoe/ui/input';
import { SectionHeader } from '@qoe/ui/section-header';
import { Select } from '@qoe/ui/select';
import { Stat } from '@qoe/ui/stat';
import { StatusDot, type StatusTone } from '@qoe/ui/status-dot';
import type { AbuseIncidentKind } from '@qoe/sdk';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { AbuseIncidentItem, AbuseMetrics } from '@/lib/admin-data';

interface IncidentsQueueProps {
  initialItems: AbuseIncidentItem[];
  metrics: AbuseMetrics | null;
}

const KIND_LABELS: Record<AbuseIncidentKind, string> = {
  account_farm: 'Ferme de comptes',
  report_raid: 'Raid de signalement',
  signup_flood: 'Vague d\u2019inscriptions',
  api_abuse: 'Abus API',
  impersonation: 'Usurpation',
  spam_wave: 'Vague de spam',
  other: 'Autre',
};

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Ouvert', tone: 'warning' },
  contained: { label: 'Contenu', tone: 'brand' },
  resolved: { label: 'Résolu', tone: 'success' },
  reopened: { label: 'Rouvert', tone: 'danger' },
};

const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  open: [
    { to: 'contained', label: 'Contenir' },
    { to: 'resolved', label: 'Résoudre' },
  ],
  contained: [
    { to: 'resolved', label: 'Résoudre' },
    { to: 'reopened', label: 'Rouvrir' },
  ],
  reopened: [
    { to: 'contained', label: 'Contenir' },
    { to: 'resolved', label: 'Résoudre' },
  ],
  resolved: [{ to: 'reopened', label: 'Rouvrir' }],
};

export function IncidentsQueue({ initialItems, metrics }: IncidentsQueueProps) {
  const [items] = useState<AbuseIncidentItem[]>(initialItems);
  const { loadingId, run: staffRun } = useStaffAction<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [measure, setMeasure] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('other');
  const [scope, setScope] = useState('');
  const [impact, setImpact] = useState('');

  const refresh = () => window.location.reload();

  const create = async () => {
    const res = await staffRun(
      'new',
      () => openAbuseIncidentAction({ title, kind, scope, impact }),
      { ok: 'Incident ouvert' }
    );
    if (res) {
      setShowNew(false);
      setTitle('');
      setScope('');
      setImpact('');
      refresh();
    }
  };

  const consign = async (item: AbuseIncidentItem) => {
    const res = await staffRun(
      item.id,
      () => updateAbuseIncidentAction({ incidentId: item.id, measure }),
      { ok: 'Mesure consignée' }
    );
    if (res) {
      setMeasure('');
      window.location.reload();
    }
  };

  const advance = async (item: AbuseIncidentItem, to: string) => {
    const res = await staffRun(
      item.id,
      () =>
        updateAbuseIncidentAction({
          incidentId: item.id,
          status: to,
          measure,
        }),
      { ok: 'Dossier mis à jour' }
    );
    if (res) {
      setMeasure('');
      refresh();
    }
  };

  return (
    <div className="space-y-6 font-sans text-foreground">
      {/* Santé 30 jours : les deux erreurs (abus manqué vs légitimes bloqués) */}
      {metrics && (
        <section className="rounded-panel border border-border/60 bg-card p-4">
          <SectionHeader
            eyebrow="Anti-abus"
            title="Santé sur 30 jours"
            description="Deux erreurs à surveiller ensemble : l’abus manqué et le contenu légitime bloqué."
            icon={<Icon name="trending-up" />}
            meta={metrics.openQueue}
            divider
            className="mb-3"
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat
              label="Dossiers ouverts"
              value={metrics.openQueue}
              emphasis
              icon={<Icon name="circle-alert" />}
            />
            <Stat label="Revues humaines" value={metrics.humanReviews} icon={<Icon name="eye" />} />
            <Stat
              label="Classés (faux positifs)"
              value={
                metrics.dismissalRate < 0 ? '—' : `${Math.round(metrics.dismissalRate * 100)} %`
              }
              icon={<Icon name="circle-check" />}
            />
            <Stat
              label="Verdicts auto"
              value={Object.values(metrics.autoByResult).reduce((a, b) => a + b, 0)}
              icon={<Icon name="zap" />}
            />
          </div>
          {metrics.topSubjects.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
              {metrics.topSubjects.slice(0, 5).map((s) => (
                <Badge
                  key={`${s.subjectType}:${s.subjectId}`}
                  variant="outline"
                  size="sm"
                  className="font-mono tabular-nums"
                  title={`${s.signals} signaux · dernier : ${s.lastResult}`}
                >
                  {s.subjectId.slice(0, 18)}… ({s.signals})
                </Badge>
              ))}
            </div>
          )}
        </section>
      )}

      <div>
        <Button
          variant={showNew ? 'outline' : 'solid'}
          tone="brand"
          size="sm"
          onClick={() => setShowNew((v) => !v)}
          aria-expanded={showNew}
        >
          <Icon name="plus" />
          {showNew ? 'Fermer' : 'Ouvrir un incident'}
        </Button>

        {showNew && (
          <div className="mt-3 space-y-2 rounded-panel border border-border/60 bg-card p-4">
            <Input
              size="sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre (5-200 caractères)…"
              aria-label="Titre de l’incident"
            />
            <div className="flex gap-2">
              <Select
                label="Type d'incident"
                hideLabel
                size="sm"
                className="w-56"
                value={kind}
                onValueChange={setKind}
                options={Object.entries(KIND_LABELS).map(([value, label]) => ({
                  id: value,
                  label,
                }))}
              />
              <Input
                size="sm"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Portée…"
                aria-label="Portée de l’incident"
                className="flex-1"
              />
            </div>
            <Input
              size="sm"
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="Impact connu…"
              aria-label="Impact connu"
            />
            <Button
              variant="solid"
              tone="brand"
              size="sm"
              loading={loadingId === 'new'}
              disabled={title.trim().length < 5}
              onClick={() => void create()}
            >
              Ouvrir
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 && !showNew ? (
        <EmptyState
          icon={<Icon name="shield-check" size="lg" />}
          title="Aucun incident"
          description="Les attaques confirmées se tiennent ici : portée, mesures, suivi."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.open;
            const loading = loadingId === item.id;
            const expanded = openId === item.id;

            return (
              <div key={item.id} className="rounded-panel border border-border/60 bg-card p-4">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon name="flame" size="sm" className="text-primary" />
                      <span className="text-sm font-semibold">{item.title}</span>
                      <Badge variant="soft" tone="neutral" size="sm">
                        {KIND_LABELS[item.kind] ?? item.kind}
                      </Badge>
                      <StatusDot tone={meta.tone} label={meta.label} />
                    </div>
                    {(item.scope || item.impact) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          item.scope && `Portée : ${item.scope}`,
                          item.impact && `Impact : ${item.impact}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      ouvert par {item.openedBy} · {new Date(item.createdAt).toLocaleString()}
                      {item.resolvedBy && ` · résolu par ${item.resolvedBy}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenId(expanded ? null : item.id)}
                    >
                      {expanded ? 'Refermer' : 'Mesures'}
                    </Button>
                    {(NEXT_STATUS[item.status] ?? []).map((n) => (
                      <Button
                        key={n.to}
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() => void advance(item, n.to)}
                      >
                        {n.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-2 border-t border-border/40 pt-4">
                    <p className="rounded-control bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap">
                      {item.measures || 'Aucune mesure consignée.'}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        size="sm"
                        value={measure}
                        onChange={(e) => setMeasure(e.target.value)}
                        placeholder="Nouvelle mesure (horodatée + signée)…"
                        aria-label="Nouvelle mesure"
                        className="flex-1"
                      />
                      <Button
                        variant="solid"
                        tone="brand"
                        size="sm"
                        loading={loading}
                        disabled={!measure.trim()}
                        onClick={() => void consign(item)}
                      >
                        Consigner
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
