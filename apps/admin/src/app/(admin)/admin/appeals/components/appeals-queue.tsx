'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import { Loader2, Scale, ShieldCheck, Check, X, MessageSquare } from 'lucide-react';
import { decideAbuseAppealAction, getAbuseAppealAction } from '@qoe/sdk/actions/admin';
import type { AbuseAppealItem } from '@/lib/admin-data';

interface AppealsQueueProps {
  initialItems: AbuseAppealItem[];
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: 'À prendre', tone: 'border-highlight/40' },
  under_review: { label: 'En cours', tone: 'border-border' },
  decided: { label: 'Tranché', tone: 'border-border opacity-70' },
};

export function AppealsQueue({ initialItems }: AppealsQueueProps) {
  const [items, setItems] = useState<AbuseAppealItem[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AbuseAppealItem | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');

  const refreshDetail = async (id: string) => {
    const res = await getAbuseAppealAction({ appealId: id });
    if (res.ok) {
      setDetail(res.data.appeal as AbuseAppealItem);
    }
  };

  const toggle = async (item: AbuseAppealItem) => {
    if (openId === item.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(item.id);
    setDetail(item);
    setNote('');
    setReply('');
    await refreshDetail(item.id);
  };

  const run = async (item: AbuseAppealItem, status: string, outcome?: string) => {
    setLoadingId(item.id);
    try {
      const res = await decideAbuseAppealAction({
        appealId: item.id,
        status,
        outcome,
        staffNote: note,
        reply,
      });
      if (res.ok) {
        toast.success(
          status === 'under_review'
            ? 'Dossier pris en main'
            : outcome === 'overturned'
              ? 'Mesure levée (faux positif avéré)'
              : 'Mesure confirmée'
        );
        setNote('');
        setReply('');
        await refreshDetail(item.id);
        // La liste reflète le nouveau statut (les tranchés restent visibles,
        // filtrés par statut — pas de disparition brutale comme la revue).
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: (status === 'decided' ? 'decided' : status) as AbuseAppealItem['status'],
                  outcome: (outcome ?? null) as AbuseAppealItem['outcome'],
                }
              : it
          )
        );
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

  const openItems = items.filter((a) => a.status !== 'decided');
  const decidedItems = items.filter((a) => a.status === 'decided');

  const renderCard = (item: AbuseAppealItem) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.open;
    const loading = loadingId === item.id;
    const expanded = openId === item.id;
    const shown = expanded && detail?.id === item.id ? detail : item;
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
              {shown.outcome && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {shown.outcome === 'overturned' ? 'Infirmé (mesure levée)' : 'Confirmé'}
                </span>
              )}
              <code className="text-[11px] text-muted-foreground font-mono truncate max-w-full">
                {shown.subjectType}:{shown.subjectId}
              </code>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ouvert le {new Date(shown.createdAt).toLocaleString()}
              {shown.decidedBy && ` · tranché par ${shown.decidedBy}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              onClick={() => void toggle(item)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted transition-all cursor-pointer flex items-center gap-1.5"
            >
              <MessageSquare className="w-3 h-3" />
              {expanded ? 'Refermer' : 'Dossier'}
            </button>
            {shown.status === 'open' && (
              <button
                disabled={loading}
                onClick={() => void run(item, 'under_review')}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Prendre en main
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
            <div className="space-y-2">
              {(shown.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`text-xs rounded-xl px-3 py-2 max-w-2xl ${
                    m.authorId === shown.openedBy
                      ? 'bg-muted/60'
                      : 'bg-highlight/10 border border-highlight/30 ml-6'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {m.authorId === shown.openedBy ? 'Utilisateur' : 'Staff'} ·{' '}
                    {new Date(m.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              {(shown.messages ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun message.</p>
              )}
            </div>
            {shown.status !== 'decided' ? (
              <div className="space-y-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note interne (audit, non visible)…"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-muted/40 outline-none"
                />
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Réponse à l'utilisateur (visible)…"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-muted/40 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    disabled={loading}
                    onClick={() => void run(item, 'decided', 'upheld')}
                    className="text-xs font-bold px-4 py-2 rounded-xl border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    Confirmer la mesure
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => void run(item, 'decided', 'overturned')}
                    className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Infirmer (lever la mesure)
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                Dossier clos — pour rouvrir, l&apos;utilisateur dépose un nouveau recours.
              </p>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6 text-foreground font-sans">
      {items.length === 0 ? (
        <div className="bg-white border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3 shadow-sm">
          <Scale className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold">Aucun recours 🎉</p>
          <p className="text-xs">
            Les contestations des mesures visant un compte apparaîtront ici.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">{openItems.map(renderCard)}</AnimatePresence>
          </div>
          {decidedItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tranchés ({decidedItems.length})
              </h2>
              <AnimatePresence mode="popLayout">{decidedItems.map(renderCard)}</AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}
