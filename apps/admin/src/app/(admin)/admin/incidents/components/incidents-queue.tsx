'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Flame, Plus, TrendingUp } from 'lucide-react';
import { openAbuseIncidentAction, updateAbuseIncidentAction } from '@qoe/sdk/actions/admin';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { AbuseIncidentItem, AbuseMetrics } from '@/lib/admin-data';

interface IncidentsQueueProps {
  initialItems: AbuseIncidentItem[];
  metrics: AbuseMetrics | null;
}

const KIND_LABELS: Record<string, string> = {
  account_farm: 'Ferme de comptes',
  report_raid: 'Raid de signalement',
  signup_flood: 'Vague d\u2019inscriptions',
  api_abuse: 'Abus API',
  impersonation: 'Usurpation',
  spam_wave: 'Vague de spam',
  other: 'Autre',
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: 'Ouvert', tone: 'border-highlight/40' },
  contained: { label: 'Contenu', tone: 'border-border' },
  resolved: { label: 'Résolu', tone: 'border-border opacity-70' },
  reopened: { label: 'Rouvert', tone: 'border-highlight/40' },
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
  const [items, setItems] = useState<AbuseIncidentItem[]>(initialItems);
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
    <div className="space-y-6 text-foreground font-sans">
      {/* Santé 30 jours : les deux erreurs (abus manqué vs légitimes bloqués) */}
      {metrics && (
        <div className="bg-white border border-border rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            <TrendingUp className="w-4 h-4" />
            Santé anti-abus (30 jours)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold">{metrics.openQueue}</p>
              <p className="text-[11px] text-muted-foreground">dossiers ouverts</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics.humanReviews}</p>
              <p className="text-[11px] text-muted-foreground">revues humaines</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {metrics.dismissalRate < 0 ? '—' : `${Math.round(metrics.dismissalRate * 100)} %`}
              </p>
              <p className="text-[11px] text-muted-foreground">classés (faux positifs)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {Object.values(metrics.autoByResult).reduce((a, b) => a + b, 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">verdicts auto</p>
            </div>
          </div>
          {metrics.topSubjects.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-1.5">
              {metrics.topSubjects.slice(0, 5).map((s) => (
                <span
                  key={`${s.subjectType}:${s.subjectId}`}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono"
                  title={`${s.signals} signaux · dernier : ${s.lastResult}`}
                >
                  {s.subjectId.slice(0, 18)}… ({s.signals})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" />
          Ouvrir un incident
        </button>
        {showNew && (
          <div className="mt-3 bg-white border border-border rounded-3xl p-5 shadow-sm space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre (5-200 caractères)…"
              className="w-full text-xs px-3 py-2 rounded-xl border border-border outline-none"
            />
            <div className="flex gap-2">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-border bg-white"
              >
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Portée…"
                className="flex-1 text-xs px-3 py-2 rounded-xl border border-border outline-none"
              />
            </div>
            <input
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="Impact connu…"
              className="w-full text-xs px-3 py-2 rounded-xl border border-border outline-none"
            />
            <button
              disabled={loadingId === 'new' || title.trim().length < 5}
              onClick={() => void create()}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {loadingId === 'new' && <Loader2 className="w-3 h-3 animate-spin" />}
              Ouvrir
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && !showNew ? (
        <QueueEmpty
          title="Aucun incident 🎉"
          hint="Les attaques confirmées se tiennent ici : portée, mesures, suivi."
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.open;
              const loading = loadingId === item.id;
              const expanded = openId === item.id;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`bg-white border rounded-3xl p-5 shadow-sm ${meta.tone}`}
                >
                  <div className="flex flex-col lg:flex-row gap-4 lg:items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Flame className="w-3.5 h-3.5 text-[#EE4B2B]" />
                        <span className="text-sm font-bold">{item.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {KIND_LABELS[item.kind] ?? item.kind}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-highlight/15 text-highlight border border-highlight/40">
                          {meta.label}
                        </span>
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
                      <button
                        onClick={() => setOpenId(expanded ? null : item.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer"
                      >
                        {expanded ? 'Refermer' : 'Mesures'}
                      </button>
                      {(NEXT_STATUS[item.status] ?? []).map((n) => (
                        <button
                          key={n.to}
                          disabled={loading}
                          onClick={() => void advance(item, n.to)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50"
                        >
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
                      <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-xl px-3 py-2">
                        {item.measures || 'Aucune mesure consignée.'}
                      </p>
                      <div className="flex gap-2">
                        <input
                          value={measure}
                          onChange={(e) => setMeasure(e.target.value)}
                          placeholder="Nouvelle mesure (horodatée + signée)…"
                          className="flex-1 text-xs px-3 py-2 rounded-xl border border-border outline-none"
                        />
                        <button
                          disabled={loading || !measure.trim()}
                          onClick={() => void consign(item)}
                          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50"
                        >
                          Consigner
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
