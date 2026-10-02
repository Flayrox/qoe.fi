'use client';

// =====================================================================
// 🤝 ApprovalsQueue — décider une double validation, une par une
// =====================================================================
// Deux principes visibles dans l'interface :
//   - l'auteur d'une demande ne voit PAS les boutons de décision (le serveur
//     refuserait, mais proposer un bouton qui répond 403 est un piège) ;
//   - le motif de la demande est affiché EN ENTIER avant de décider : on ne
//     valide pas un identifiant, on valide une raison écrite.
// =====================================================================

import React, { useState, useTransition } from 'react';
import { Loader2, Check, X, Clock, Handshake } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';
import { attemptWithStepUp, notifyActionFailure } from '@/lib/authz-feedback';
import { decideApprovalAction } from '@/lib/admin-approval-actions';
import {
  APPROVAL_ACT_LABELS,
  APPROVAL_STATUS_LABELS,
  isApprovalOpen,
  type AdminApprovalItem,
} from '@/lib/admin-approval-types';

interface ApprovalsQueueProps {
  initialItems: AdminApprovalItem[];
  /** Identité de la personne connectée : elle ne peut pas décider ses demandes. */
  currentUserId: string;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ApprovalsQueue({ initialItems, currentUserId }: ApprovalsQueueProps) {
  const [items, setItems] = useState<AdminApprovalItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = items.filter((item) => isApprovalOpen(item));
  const closed = items.filter((item) => !isApprovalOpen(item));

  function decide(item: AdminApprovalItem, decision: 'approved' | 'rejected') {
    setBusyId(item.id);
    startTransition(async () => {
      const res = await attemptWithStepUp(
        () => decideApprovalAction({ approvalId: item.id, decision, note }),
        { reason: `Validation ${item.act} — ${APPROVAL_ACT_LABELS[item.act] ?? item.act}` }
      );
      setBusyId(null);
      if (!res.success) {
        notifyActionFailure(res, res.error);
        return;
      }
      toast.success(decision === 'approved' ? 'Demande approuvée.' : 'Demande refusée.');
      setNote('');
      setOpenId(null);
      // L'état local suit la décision sans recharger : la file reste lisible
      // même si la revalidation serveur tarde.
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: decision,
                decidedBy: currentUserId,
                decidedAt: new Date().toISOString(),
                note,
              }
            : it
        )
      );
    });
  }

  const renderCard = (item: AdminApprovalItem) => {
    const stillOpen = isApprovalOpen(item);
    const mine = item.requestedBy === currentUserId;
    const expanded = openId === item.id;
    const busy = busyId === item.id;
    return (
      <div
        key={item.id}
        className="bg-white border border-border rounded-3xl p-5 shadow-sm space-y-3"
        data-testid={`approval-${item.id}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={stillOpen ? 'hot' : 'muted'}>
            {APPROVAL_STATUS_LABELS[item.status] ?? item.status}
          </StatusPill>
          <span className="text-xs font-semibold">{APPROVAL_ACT_LABELS[item.act] ?? item.act}</span>
          <code className="text-[11px] font-mono text-muted-foreground truncate">
            {item.target || 'sans cible'}
          </code>
          {mine && stillOpen && (
            <span className="text-[11px] text-muted-foreground">
              — vous avez demandé cette validation
            </span>
          )}
        </div>

        <p className="text-xs whitespace-pre-wrap text-foreground">{item.reason}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>demandée le {formatDate(item.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {stillOpen ? `expire le ${formatDate(item.expiresAt)}` : 'clause close'}
          </span>
          {item.decidedBy && <span>décidée par {item.decidedBy}</span>}
          {item.note && <span>note : {item.note}</span>}
        </div>

        {stillOpen && !mine && (
          <div className="pt-1 space-y-2">
            {expanded ? (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note de décision (facultative, jointe à l’audit)…"
                  data-testid={`approval-note-${item.id}`}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-muted/40 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    disabled={pending || busy}
                    onClick={() => decide(item, 'approved')}
                    data-testid={`approval-approve-${item.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Approuver
                  </button>
                  <button
                    disabled={pending || busy}
                    onClick={() => decide(item, 'rejected')}
                    data-testid={`approval-reject-${item.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl border border-border bg-white hover:bg-muted cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                    Refuser
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  setOpenId(item.id);
                  setNote('');
                }}
                data-testid={`approval-open-${item.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white hover:bg-muted cursor-pointer"
              >
                <Handshake className="w-3 h-3" />
                Décider
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <QueueEmpty
        title="Aucune demande de validation 🎉"
        hint="Les actes irréversibles qui attendent une seconde personne apparaîtront ici."
      />
    );
  }

  return (
    <div className="space-y-6 text-foreground font-sans" data-testid="approvals-queue">
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          En attente ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-xs text-muted-foreground">Rien à valider pour le moment.</p>
        ) : (
          open.map(renderCard)
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Décidées ({closed.length})
          </h2>
          {closed.map(renderCard)}
        </section>
      )}
    </div>
  );
}
