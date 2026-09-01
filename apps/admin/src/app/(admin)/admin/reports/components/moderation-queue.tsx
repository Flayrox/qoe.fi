'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  EyeOff,
  Eye,
  Ban,
  Check,
  X,
  Flag,
  MessageSquareQuote,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import { resolveModerationReportAction } from '@qoe/sdk/actions/admin';
import type { ModerationReportItem } from '@/lib/admin-data';

interface ModerationQueueProps {
  initialItems: ModerationReportItem[];
  initialPending: number;
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam / publicité',
  harassment: 'Harcèlement',
  hate_speech: 'Discours haineux',
  misleading: 'Désinformation',
  other: 'Autre',
};

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  thought: { label: 'Pensée', icon: <MessageSquareQuote className="w-3 h-3" /> },
  article: { label: 'Article', icon: <FileText className="w-3 h-3" /> },
  user: { label: 'Compte', icon: <UserIcon className="w-3 h-3" /> },
};

export function ModerationQueue({ initialItems, initialPending }: ModerationQueueProps) {
  const [items, setItems] = useState<ModerationReportItem[]>(initialItems);
  const [pending, setPending] = useState(initialPending);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('pending');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [suspendNoteId, setSuspendNoteId] = useState<string | null>(null);
  const [suspendNote, setSuspendNote] = useState('');

  const run = async (report: ModerationReportItem, action: string, note = '') => {
    setLoadingId(report.id);
    try {
      const res = await resolveModerationReportAction({ reportId: report.id, action, note });
      if (res.ok) {
        const updated = {
          ...report,
          status: action === 'dismiss' ? 'dismissed' : 'resolved',
          actionTaken: action,
        };
        setItems((prev) => prev.map((it) => (it.id === report.id ? updated : it)));
        if (report.status === 'pending') setPending((p) => Math.max(0, p - 1));
        toast.success(action === 'dismiss' ? 'Signalement ignoré' : 'Signalement traité');
        setSuspendNoteId(null);
        setSuspendNote('');
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

  const filtered = items.filter((it) => filter === 'all' || it.status === filter);

  return (
    <div className="space-y-6 text-foreground font-sans">
      {/* Barre de filtres + badge pending */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'pending', label: `En attente (${pending})` },
              { id: 'resolved', label: 'Résolus' },
              { id: 'dismissed', label: 'Ignorés' },
              { id: 'all', label: 'Tous' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#EE4B2B] text-white border-[#EE4B2B] shadow-sm'
                  : 'bg-white text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3 shadow-sm">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold">
            {filter === 'pending' ? 'Aucun signalement en attente 🎉' : 'Aucun signalement ici'}
          </p>
          <p className="text-xs">
            {filter === 'pending'
              ? 'La file est vide. Les signalements de la communauté apparaîtront ici.'
              : 'Ajustez le filtre pour voir d’autres statuts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((report) => {
              const typeMeta = TYPE_META[report.targetType] ?? TYPE_META.thought;
              const isPending = report.status === 'pending';
              const loading = loadingId === report.id;
              return (
                <motion.div
                  key={report.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`bg-white border rounded-3xl p-5 shadow-sm transition-colors ${
                    isPending ? 'border-highlight/40' : 'border-border'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row gap-4 lg:items-start justify-between">
                    {/* Contenu signalé */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                            isPending
                              ? 'bg-highlight/10 text-highlight border-highlight/40'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {typeMeta.icon}
                          {typeMeta.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/40">
                          <Flag className="w-3 h-3" />
                          {REASON_LABELS[report.reason] ?? report.reason}
                        </span>
                        {report.targetCount > 1 && (
                          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {report.targetCount} signalements sur cette cible
                          </span>
                        )}
                        {report.actionTaken !== 'none' && report.actionTaken !== '' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-foreground text-background">
                            <EyeOff className="w-3 h-3" />
                            {report.actionTaken}
                          </span>
                        )}
                      </div>

                      {report.targetPreview ? (
                        <p className="text-sm leading-relaxed text-foreground/90 line-clamp-3 bg-muted/40 border border-border/60 rounded-xl p-3 font-mono text-xs">
                          {report.targetPreview}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Cible indisponible</p>
                      )}

                      {report.details && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground/80">Détails : </span>
                          {report.details}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          Signalé par{' '}
                          <span className="font-semibold text-foreground/80">
                            {report.reporter.name ||
                              report.reporter.username ||
                              report.reporter.id.slice(0, 8)}
                          </span>
                        </span>
                        <span className="font-mono">
                          {new Date(report.createdAt).toLocaleString('fr-FR')}
                        </span>
                        <span className="font-mono text-[10px]">#{report.id.slice(0, 8)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-stretch gap-2 shrink-0 lg:w-56">
                      {loading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[#EE4B2B]" />
                        </div>
                      ) : (
                        <>
                          {isPending && (
                            <>
                              {report.targetType === 'thought' && (
                                <button
                                  onClick={() => run(report, 'hide_post')}
                                  className="flex items-center justify-center gap-1.5 bg-destructive/10 hover:bg-destructive/15 text-destructive font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                  Masquer la pensée
                                </button>
                              )}
                              {report.targetType === 'article' && (
                                <button
                                  onClick={() => run(report, 'hide_article')}
                                  className="flex items-center justify-center gap-1.5 bg-destructive/10 hover:bg-destructive/15 text-destructive font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                  Masquer l'article
                                </button>
                              )}
                              {report.targetType !== 'user' && (
                                <button
                                  onClick={() =>
                                    setSuspendNoteId(suspendNoteId === report.id ? null : report.id)
                                  }
                                  className="flex items-center justify-center gap-1.5 bg-muted hover:bg-destructive/10 hover:text-destructive border border-border text-muted-foreground font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  Suspendre l'auteur
                                </button>
                              )}
                              {suspendNoteId === report.id && (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={suspendNote}
                                    onChange={(e) => setSuspendNote(e.target.value)}
                                    placeholder="Motif de suspension…"
                                    className="w-full text-xs bg-white border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-[#EE4B2B] placeholder:text-muted-foreground"
                                  />
                                  <button
                                    onClick={() => run(report, 'suspend_author', suspendNote)}
                                    disabled={!suspendNote.trim()}
                                    className="w-full flex items-center justify-center gap-1.5 bg-destructive text-white font-bold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Confirmer la suspension
                                  </button>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => run(report, 'resolve')}
                                  className="flex items-center justify-center gap-1.5 bg-success/10 hover:bg-success/20 text-success font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Résoudre
                                </button>
                                <button
                                  onClick={() => run(report, 'dismiss')}
                                  className="flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/70 border border-border text-muted-foreground font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Ignorer
                                </button>
                              </div>
                            </>
                          )}

                          {!isPending &&
                            (report.actionTaken === 'hide_post' ||
                              report.actionTaken === 'hide_article') && (
                              <button
                                onClick={() =>
                                  run(
                                    report,
                                    report.actionTaken === 'hide_post'
                                      ? 'unhide_post'
                                      : 'unhide_article'
                                  )
                                }
                                className="flex items-center justify-center gap-1.5 bg-muted hover:bg-success/10 hover:text-success border border-border text-muted-foreground font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Restaurer le contenu
                              </button>
                            )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
