'use client';

import React, { useState } from 'react';
import { toast } from '@qoe/ui/toast';
import { Loader2, Scale, ShieldCheck } from 'lucide-react';
import {
  openAppealAction,
  addAppealMessageAction,
  getMyAppealAction,
  listMyAppealsAction,
  type AppealDTO,
} from '@qoe/sdk';
import { DossierThread } from '@/components/dossiers/DossierThread';

interface AppealsAppProps {
  userId: string;
  initialItems: AppealDTO[];
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Ouvert — en attente de revue',
  under_review: 'En cours de revue',
  decided: 'Tranché',
};

export function AppealsApp({ userId, initialItems }: AppealsAppProps) {
  const [items, setItems] = useState<AppealDTO[]>(initialItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppealDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const refreshList = async () => {
    const res = await listMyAppealsAction({ limit: 20 });
    if (res.ok) setItems(res.data.items);
  };

  const openDetail = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    const res = await getMyAppealAction(id);
    if (res.ok) setDetail(res.data.appeal);
  };

  const submitOpen = async () => {
    if (message.trim().length < 1) return;
    setLoading(true);
    try {
      const res = await openAppealAction({ subjectId: userId, message: message.trim() });
      if (res.ok) {
        toast.success('Recours déposé — il ne lève rien à lui seul, le staff va le revoir.');
        setMessage('');
        await refreshList();
      } else {
        toast.error(
          typeof res.error === 'string'
            ? res.error
            : 'Dépôt impossible (un recours est peut-être déjà ouvert).'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const submitMessage = async (id: string, text: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await addAppealMessageAction({ appealId: id, body: text });
      if (res.ok) {
        const d = await getMyAppealAction(id);
        if (d.ok) setDetail(d.data.appeal);
        return true;
      }
      toast.error(typeof res.error === 'string' ? res.error : 'Envoi impossible.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          <Scale className="w-4 h-4" />
          Contestation
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Mes recours</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Une mesure vise votre compte à tort ? Contestez ici. Déposer un recours ne lève rien à lui
          seul — le staff revoit chaque dossier et tranche : mesure confirmée, ou faux positif avéré
          (la mesure tombe).
        </p>
      </div>

      <div className="bg-muted/40 border border-border/40 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">Déposer un recours</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Expliquez pourquoi la mesure est injustifiée…"
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none"
        />
        <button
          disabled={loading || message.trim().length < 1}
          onClick={() => void submitOpen()}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-foreground text-background cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Déposer
        </button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="border border-border/40 rounded-xl p-10 text-center text-muted-foreground space-y-2">
            <ShieldCheck className="w-7 h-7 mx-auto opacity-60" />
            <p className="text-sm font-semibold">Aucun recours</p>
            <p className="text-xs">
              Vos contestations apparaîtront ici, avec les réponses du staff.
            </p>
          </div>
        ) : (
          items.map((a) => {
            const expanded = openId === a.id;
            const shown = expanded && detail?.id === a.id ? detail : a;
            return (
              <div key={a.id} className="border border-border/40 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted">
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                    {a.outcome === 'overturned' && ' · Mesure levée'}
                    {a.outcome === 'upheld' && ' · Mesure confirmée'}
                  </span>
                </div>
                <button
                  onClick={() => void openDetail(a.id)}
                  className="text-xs font-semibold underline underline-offset-2 cursor-pointer"
                >
                  {expanded ? 'Refermer' : 'Voir le dossier'}
                </button>
                {expanded && (
                  <DossierThread
                    messages={shown.messages ?? []}
                    viewerId={userId}
                    canWrite={a.status !== 'decided'}
                    closedHint="Dossier clos — déposez un nouveau recours si besoin."
                    placeholder="Écrire au dossier…"
                    sending={loading}
                    onSend={(text) => submitMessage(a.id, text)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
