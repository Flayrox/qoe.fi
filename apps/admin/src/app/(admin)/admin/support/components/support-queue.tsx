'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import { Loader2, LifeBuoy, ShieldCheck, Inbox } from 'lucide-react';
import {
  assignSupportTicketAction,
  updateSupportTicketAction,
  getSupportTicketAction,
} from '@qoe/sdk/actions/admin';
import type { SupportTicketItem, SupportMetrics } from '@/lib/admin-data';

interface SupportQueueProps {
  initialItems: SupportTicketItem[];
  metrics: SupportMetrics | null;
}

const KIND_LABELS: Record<string, string> = {
  account_restricted: 'Compte restreint',
  account_lost: 'Compte perdu / MFA',
  content_moderation: 'Contenu modéré',
  api_access: 'Accès API',
  import_issue: 'Import',
  delivery: 'Livraison e-mails',
  report_issue: 'Signalement',
  other: 'Autre',
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: 'Ouvert', tone: 'border-highlight/40' },
  under_review: { label: 'En cours', tone: 'border-border' },
  closed: { label: 'Clos', tone: 'border-border opacity-70' },
};

export function SupportQueue({ initialItems, metrics }: SupportQueueProps) {
  const [items, setItems] = useState<SupportTicketItem[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportTicketItem | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');

  const refreshDetail = async (id: string) => {
    const res = await getSupportTicketAction({ ticketId: id });
    if (res.ok) {
      setDetail(res.data.ticket as SupportTicketItem);
    }
  };

  const toggle = async (item: SupportTicketItem) => {
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

  const assign = async (item: SupportTicketItem) => {
    setLoadingId(item.id);
    try {
      const res = await assignSupportTicketAction({ ticketId: item.id });
      if (res.ok) {
        toast.success('Dossier pris en main');
        await refreshDetail(item.id);
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'under_review' as const } : it))
        );
      } else {
        toast.error(typeof res.error === 'string' ? res.error : 'Action impossible');
      }
    } finally {
      setLoadingId(null);
    }
  };

  const close = async (item: SupportTicketItem) => {
    setLoadingId(item.id);
    try {
      const res = await updateSupportTicketAction({
        ticketId: item.id,
        status: 'closed',
        staffNote: note,
        reply,
      });
      if (res.ok) {
        toast.success('Dossier clos');
        setNote('');
        setReply('');
        await refreshDetail(item.id);
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'closed' as const } : it))
        );
      } else {
        toast.error(typeof res.error === 'string' ? res.error : 'Clôture impossible');
      }
    } finally {
      setLoadingId(null);
    }
  };

  const openItems = items.filter((t) => t.status !== 'closed');
  const closedItems = items.filter((t) => t.status === 'closed');

  const renderCard = (item: SupportTicketItem) => {
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
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {KIND_LABELS[item.kind] ?? item.kind}
              </span>
              {shown.assignee && (
                <span className="text-[11px] text-muted-foreground">→ {shown.assignee}</span>
              )}
            </div>
            <p className="text-sm font-semibold">{shown.subject}</p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(shown.createdAt).toLocaleString()}
              {shown.closedBy && ` · clos par ${shown.closedBy}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              onClick={() => void toggle(item)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer"
            >
              {expanded ? 'Refermer' : 'Dossier'}
            </button>
            {shown.status === 'open' && (
              <button
                disabled={loading}
                onClick={() => void assign(item)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
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
            </div>
            {shown.status !== 'closed' ? (
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
                <button
                  disabled={loading}
                  onClick={() => void close(item)}
                  className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Inbox className="w-3 h-3" />
                  )}
                  Clore le dossier
                </button>
                <p className="text-[11px] text-muted-foreground">
                  Clore ne lève ni suspension ni permission — les actes passent par les chemins
                  existants.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                Dossier clos — un nouveau dossier rouvre si besoin.
              </p>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6 text-foreground font-sans">
      {metrics && (metrics.open > 0 || metrics.under_review > 0 || metrics.closed30d > 0) && (
        <div className="bg-white border border-border rounded-3xl p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Charge
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold">{metrics.open}</p>
              <p className="text-[11px] text-muted-foreground">ouverts</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics.under_review}</p>
              <p className="text-[11px] text-muted-foreground">en cours</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics.unassignedOpen}</p>
              <p className="text-[11px] text-muted-foreground">sans assigné</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {metrics.closed30d > 0 ? `${Math.round(metrics.avgCloseHours30d)} h` : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                délai moyen ({metrics.closed30d} clos/30 j)
              </p>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3 shadow-sm">
          <LifeBuoy className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold">Aucun dossier 🎉</p>
          <p className="text-xs">Les demandes d&apos;aide des utilisateurs apparaîtront ici.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">{openItems.map(renderCard)}</AnimatePresence>
          </div>
          {closedItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Clos ({closedItems.length})
              </h2>
              <AnimatePresence mode="popLayout">{closedItems.map(renderCard)}</AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}
