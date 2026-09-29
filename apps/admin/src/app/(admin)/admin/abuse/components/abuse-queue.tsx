'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import { Loader2, ShieldAlert, ShieldCheck, Check, Ban, EyeOff, PauseCircle } from 'lucide-react';
import { resolveAbuseDecisionAction } from '@qoe/sdk/actions/admin';
import type { AbuseDecisionItem } from '@/lib/admin-data';

interface AbuseQueueProps {
  initialItems: AbuseDecisionItem[];
}

const REASON_LABELS: Record<string, string> = {
  'burst.signup.publication': 'Rafale d\u2019inscriptions sur une publication',
  'swarm.report.target': 'Essaim de signalements contre une cible',
  'swarm.report.reporter': 'Raid de signalement (volume du plaignant)',
  'swarm.like.target': 'Essaim de likes sur une pensée',
  'swarm.like.liker': 'Volume de likes (ferme d\u2019engagement)',
};

const RESULT_META: Record<string, { label: string; tone: string }> = {
  needs_review: { label: 'Revue priorisée', tone: 'border-highlight/40' },
  limit_distribution: { label: 'Limitation', tone: 'border-border' },
  pause_sending: { label: 'Envois en pause', tone: 'border-border' },
  suspend: { label: 'Suspension', tone: 'border-border' },
};

const CLOSE_ACTIONS = [
  { id: 'allow', label: 'Classer', icon: Check, hint: 'Faux positif avéré — la mesure tombe' },
  {
    id: 'limit_distribution',
    label: 'Limiter',
    icon: EyeOff,
    hint: 'Hors découverte, présent en suivi',
  },
  {
    id: 'pause_sending',
    label: 'Pause envois',
    icon: PauseCircle,
    hint: 'Coupe les envois du sujet',
  },
  { id: 'suspend', label: 'Suspendre', icon: Ban, hint: 'Refus dur, partout — acte à part' },
] as const;

export function AbuseQueue({ initialItems }: AbuseQueueProps) {
  const [items, setItems] = useState<AbuseDecisionItem[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const run = async (item: AbuseDecisionItem, result: string) => {
    setLoadingId(item.id);
    try {
      const res = await resolveAbuseDecisionAction({
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        result,
        note,
      });
      if (res.ok) {
        // Dossier clos : il sort de la file (le verdict humain est le
        // dernier — la file ne liste que les verdicts non-allow ouverts).
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        toast.success(
          result === 'allow' ? 'Dossier classé sans suite' : `Escalade tracée (${result})`
        );
        setNoteId(null);
        setNote('');
      } else {
        const msg =
          typeof res.error === 'string' ? res.error : (res.error?.message ?? 'Action impossible');
        toast.error(msg);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Action impossible');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 text-foreground font-sans">
      {items.length === 0 ? (
        <div className="bg-white border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3 shadow-sm">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold">Aucun dossier ouvert 🎉</p>
          <p className="text-xs">
            Les rafales, essaims et raids détectés par le noyau apparaîtront ici pour revue.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item) => {
              const meta = RESULT_META[item.result] ?? RESULT_META.needs_review;
              const loading = loadingId === item.id;
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
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-highlight/15 text-highlight border border-highlight/40">
                          {meta.label}
                        </span>
                        <code className="text-[11px] text-muted-foreground font-mono truncate max-w-full">
                          {item.subjectType}:{item.subjectId}
                        </code>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.reasonCodes.map((r) => (
                          <span
                            key={r}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                          >
                            {REASON_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {item.recentFacts} fait{item.recentFacts > 1 ? 's' : ''} récent
                        {item.recentFacts > 1 ? 's' : ''} · politique {item.policy}/{item.version} ·{' '}
                        {item.decidedBy === 'human' ? 'verdict humain' : 'automate'} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {CLOSE_ACTIONS.map((a) => (
                        <button
                          key={a.id}
                          title={a.hint}
                          disabled={loading}
                          onClick={() => {
                            if (noteId === `${item.id}:${a.id}`) {
                              void run(item, a.id);
                            } else {
                              setNoteId(`${item.id}:${a.id}`);
                            }
                          }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {loading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <a.icon className="w-3 h-3" />
                          )}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {noteId?.startsWith(item.id) && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Motif tracé (visible à l'audit)…"
                        className="flex-1 text-xs px-3 py-2 rounded-xl border border-border bg-muted/40 outline-none"
                      />
                      <button
                        disabled={loading}
                        onClick={() => void run(item, noteId.split(':')[1])}
                        className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <ShieldAlert className="w-3 h-3" />
                    Un dossier ouvert n&apos;est pas une preuve — classer ou escalader, en traçant
                    le motif.
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
