'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus } from 'lucide-react';
import { grantSubscriptionAction, revokeSubscriptionGrantAction } from '@qoe/sdk/actions/admin';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { SubscriptionGrantItem } from '@/lib/admin-data';

interface GrantsManagerProps {
  initialItems: SubscriptionGrantItem[];
}

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function GrantsManager({ initialItems }: GrantsManagerProps) {
  const [items, setItems] = useState<SubscriptionGrantItem[]>(initialItems);
  const { loadingId, run: staffRun } = useStaffAction<string>();
  const [showNew, setShowNew] = useState(false);
  const [subjectType, setSubjectType] = useState('publication');
  const [subjectId, setSubjectId] = useState('');
  const [plan, setPlan] = useState('pro');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => window.location.reload();

  // datetime-local → RFC3339 (UTC). Vide = défaut backend (maintenant / sans fin).
  const toRFC = (v: string): string => (v ? new Date(v).toISOString() : '');

  const grant = async () => {
    const res = await staffRun(
      'new',
      () =>
        grantSubscriptionAction({
          subjectType,
          subjectId: subjectId.trim(),
          plan,
          startsAt: toRFC(startsAt),
          endsAt: toRFC(endsAt),
          note: note.trim(),
        }),
      { ok: 'Palier octroyé' }
    );
    if (res) {
      setShowNew(false);
      setSubjectId('');
      setStartsAt('');
      setEndsAt('');
      setNote('');
      refresh();
    }
  };

  const revoke = async (item: SubscriptionGrantItem) => {
    const res = await staffRun(item.id, () => revokeSubscriptionGrantAction({ grantId: item.id }), {
      ok: 'Droit révoqué (fin immédiate)',
    });
    if (res) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, effective: false } : it)));
    }
  };

  return (
    <div className="space-y-6 text-foreground font-sans">
      <div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" />
          Octroyer un palier
        </button>
        {showNew && (
          <div className="mt-3 bg-white border border-border rounded-3xl p-5 shadow-sm space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value)}
                className={inputCls}
              >
                <option value="publication">Média (publication)</option>
                <option value="user">Lecteur (compte)</option>
              </select>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
                <option value="pro">Pro (médias + avantages lecteur)</option>
                <option value="plus">Plus (lecteur)</option>
              </select>
            </div>
            <input
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Identifiant du sujet (id publication ou compte)…"
              className={inputCls}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-[11px] text-muted-foreground space-y-1 block">
                Début (vide = maintenant)
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="text-[11px] text-muted-foreground space-y-1 block">
                Fin (vide = sans fin)
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif (presse, test, offert…)…"
              maxLength={200}
              className={inputCls}
            />
            <button
              disabled={loadingId === 'new' || subjectId.trim().length < 1}
              onClick={() => void grant()}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {loadingId === 'new' && <Loader2 className="w-3 h-3 animate-spin" />}
              Octroyer
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && !showNew ? (
        <QueueEmpty
          title="Aucun octroi 🎉"
          hint="Pro offert, accès programmé, fin datée : tout se tient ici, avec historique."
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white border border-border rounded-3xl p-5 shadow-sm"
              >
                <div className="flex flex-col lg:flex-row gap-4 lg:items-start justify-between">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={item.effective ? 'hot' : 'muted'}>
                        {item.effective ? 'Effectif' : 'Inactif'}
                      </StatusPill>
                      <StatusPill>{item.plan === 'pro' ? 'Pro' : 'Plus'}</StatusPill>
                      <code className="text-[11px] text-muted-foreground font-mono truncate max-w-full">
                        {item.subjectType}:{item.subjectId}
                      </code>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      du {fmtDate(item.startsAt)} au {fmtDate(item.endsAt)} · par {item.grantedBy}
                      {item.note && ` · ${item.note}`}
                    </p>
                  </div>
                  {item.effective && (
                    <button
                      disabled={loadingId === item.id}
                      onClick={() => void revoke(item)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {loadingId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                      Révoquer
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
