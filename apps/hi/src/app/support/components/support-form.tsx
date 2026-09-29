'use client';

import React, { useState } from 'react';
import { submitPublicTicket } from '@/lib/support-actions';

const KINDS = [
  { id: 'account_lost', label: 'Compte perdu / Lost account' },
  { id: 'account_restricted', label: 'Compte restreint / Restricted account' },
  { id: 'content_moderation', label: 'Contenu / Content' },
  { id: 'api_access', label: 'API' },
  { id: 'import_issue', label: 'Import' },
  { id: 'delivery', label: 'E-mails / Email delivery' },
  { id: 'report_issue', label: 'Signalement / Report' },
  { id: 'other', label: 'Autre / Other' },
];

const inputCls =
  'w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none';

export function SupportForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; account: boolean } | null>(null);

  const submit = async () => {
    setSending(true);
    setError('');
    try {
      const res = await submitPublicTicket({ name, email, kind, subject, message });
      if (res.ok) {
        setDone({ id: res.id, account: res.account });
        setSubject('');
        setMessage('');
      } else {
        setError(res.error);
      }
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-border/60 p-6 text-center space-y-2">
        <p className="text-sm font-semibold">Dossier ouvert — Request received ✓</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {done.account
            ? 'Il est ouvert sur votre compte : suivez-le depuis votre espace. / Opened on your account.'
            : 'Il est lié à votre e-mail : conservez cette référence. / Linked to your email — keep this reference:'}
        </p>
        {done.id && (
          <code className="block text-xs font-mono bg-muted/60 rounded-lg px-3 py-2 break-all">
            {done.id}
          </code>
        )}
        <button
          onClick={() => setDone(null)}
          className="text-xs font-semibold underline underline-offset-2 cursor-pointer"
        >
          Ouvrir un autre dossier / Open another
        </button>
      </div>
    );
  }

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    subject.trim().length >= 5 &&
    message.trim().length >= 1;

  return (
    <div className="rounded-xl border border-border/60 p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom / Name (optionnel)"
          maxLength={100}
          className={inputCls}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail *"
          type="email"
          className={inputCls}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet / Subject (5 min) *"
          maxLength={200}
          className={inputCls}
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Décrivez le problème… / Describe the issue… *"
        rows={5}
        className={inputCls}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        disabled={sending || !valid}
        onClick={() => void submit()}
        className="text-sm font-bold px-5 py-2.5 rounded-xl bg-foreground text-background cursor-pointer disabled:opacity-50"
      >
        {sending ? 'Envoi… / Sending…' : 'Envoyer / Send'}
      </button>
      <p className="text-[11px] text-muted-foreground">
        3 dossiers max par jour et par adresse (anti-spam). / Max 3 cases per day per address.
      </p>
    </div>
  );
}
