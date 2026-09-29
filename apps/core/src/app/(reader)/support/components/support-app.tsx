'use client';

import React, { useState } from 'react';
import { toast } from '@qoe/ui/toast';
import { Loader2, LifeBuoy, ShieldCheck } from 'lucide-react';
import { DossierThread } from '@/components/dossiers/DossierThread';
import { URLS } from '@qoe/config';

// Centre d'aide public (vitrine) : réponses immédiates avant d'ouvrir un
// dossier. URLS.LANDING = hi.qoe.fi (env-aware : dev/staging/prod).
const helpCenterUrl = `${URLS.LANDING}/support`;
import {
  openSupportTicketAction,
  addSupportMessageAction,
  getMySupportTicketAction,
  listMySupportTicketsAction,
  SUPPORT_KINDS,
  type SupportTicketDTO,
} from '@qoe/sdk';

interface SupportAppProps {
  initialItems: SupportTicketDTO[];
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Ouvert — en attente',
  under_review: 'Pris en main',
  closed: 'Clos',
};

export function SupportApp({ initialItems }: SupportAppProps) {
  const [items, setItems] = useState<SupportTicketDTO[]>(initialItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportTicketDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<string>('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const refreshList = async () => {
    const res = await listMySupportTicketsAction({ limit: 20 });
    if (res.ok) setItems(res.data.items);
  };

  const openDetail = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    const res = await getMySupportTicketAction(id);
    if (res.ok) setDetail(res.data.ticket);
  };

  const submitOpen = async () => {
    if (subject.trim().length < 5 || message.trim().length < 1) return;
    setLoading(true);
    try {
      const res = await openSupportTicketAction({
        kind,
        subject: subject.trim(),
        message: message.trim(),
      });
      if (res.ok) {
        toast.success('Dossier ouvert — le staff va le prendre en main.');
        setSubject('');
        setMessage('');
        await refreshList();
      } else {
        toast.error(
          typeof res.error === 'string'
            ? res.error
            : 'Ouverture impossible (un dossier est peut-être déjà ouvert pour ce motif).'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const submitMessage = async (id: string, text: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await addSupportMessageAction({ ticketId: id, body: text });
      if (res.ok) {
        const d = await getMySupportTicketAction(id);
        if (d.ok) setDetail(d.data.ticket);
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
          <LifeBuoy className="w-4 h-4" />
          Aide
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Support</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Un problème de compte, de contenu, d&apos;API, d&apos;import ou de livraison ?
          D&apos;abord, le{' '}
          <a href={helpCenterUrl} className="underline underline-offset-2 font-semibold">
            centre d&apos;aide
          </a>{' '}
          (réponses immédiates) — sinon ouvrez un dossier, un par motif, le reste s&apos;écrit
          dedans. Pour contester une mesure anti-abus,{' '}
          <a href="/recours" className="underline underline-offset-2 font-semibold">
            voyez vos recours
          </a>
          .
        </p>
      </div>

      <div className="bg-muted/40 border border-border/40 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">Ouvrir un dossier</h2>
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-border bg-background"
          >
            {SUPPORT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Sujet (5-200 caractères)…"
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none"
          />
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Décrivez le problème…"
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none"
        />
        <button
          disabled={loading || subject.trim().length < 5 || message.trim().length < 1}
          onClick={() => void submitOpen()}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-foreground text-background cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Ouvrir
        </button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="border border-border/40 rounded-xl p-10 text-center text-muted-foreground space-y-2">
            <ShieldCheck className="w-7 h-7 mx-auto opacity-60" />
            <p className="text-sm font-semibold">Aucun dossier</p>
            <p className="text-xs">Vos demandes d&apos;aide apparaîtront ici, avec les réponses.</p>
          </div>
        ) : (
          items.map((t) => {
            const expanded = openId === t.id;
            const shown = expanded && detail?.id === t.id ? detail : t;
            return (
              <div key={t.id} className="border border-border/40 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-semibold">{t.subject}</p>
                <button
                  onClick={() => void openDetail(t.id)}
                  className="text-xs font-semibold underline underline-offset-2 cursor-pointer"
                >
                  {expanded ? 'Refermer' : 'Voir le dossier'}
                </button>
                {expanded && (
                  <DossierThread
                    messages={shown.messages ?? []}
                    viewerId={t.openedBy}
                    canWrite={t.status !== 'closed'}
                    closedHint="Dossier clos — ouvrez-en un nouveau si besoin."
                    placeholder="Écrire au dossier…"
                    sending={loading}
                    onSend={(text) => submitMessage(t.id, text)}
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
