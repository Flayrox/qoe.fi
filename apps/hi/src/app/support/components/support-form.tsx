'use client';

import React, { useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';
import { t } from '@lingui/core/macro';
import { submitPublicTicket, type SupportPublicError } from '@/lib/support-actions';

// Libellés résolus au rendu : une table au module resterait figée dans la
// langue par défaut.
function getKinds(): { id: string; label: string }[] {
  return [
    { id: 'account_lost', label: t`Compte perdu` },
    { id: 'account_restricted', label: t`Compte restreint` },
    { id: 'content_moderation', label: t`Contenu` },
    { id: 'api_access', label: t`API` },
    { id: 'import_issue', label: t`Import` },
    { id: 'delivery', label: t`E-mails` },
    { id: 'report_issue', label: t`Signalement` },
    { id: 'other', label: t`Autre` },
  ];
}

// Le code vient du serveur, la copie du catalogue : la langue affichée reste
// celle de l'interface, même quand l'action serveur répond en anglais.
function errorMessage(code: SupportPublicError): string {
  switch (code) {
    case 'invalid_email':
      return t`Adresse e-mail invalide.`;
    case 'missing_content':
      return t`Sujet (5 caractères minimum) et message requis.`;
    case 'unavailable':
      return t`Service indisponible pour le moment — réessayez dans un instant.`;
    case 'rate_limited':
      return t`Trop de demandes aujourd’hui, réessayez demain.`;
    case 'duplicate':
      return t`Un dossier est déjà ouvert pour ce motif avec cette adresse.`;
    case 'failed':
      return t`Envoi impossible — réessayez dans un instant.`;
  }
}

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
        setError(errorMessage(res.error));
      }
    } catch {
      // L'action serveur peut lever (réseau coupé, redéploiement, 502 de la
      // passerelle) : sans ce message le bouton semblait n'avoir rien fait et
      // le visiteur renvoyait le même dossier en boucle.
      setError(t`Envoi impossible pour le moment — réessayez dans un instant.`);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-border/60 p-6 text-center space-y-2">
        <p className="text-sm font-semibold">{t`Dossier ouvert — demande reçue ✓`}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {done.account
            ? t`Il est ouvert sur votre compte : suivez-le depuis votre espace.`
            : t`Il est lié à votre e-mail : conservez cette référence.`}
        </p>
        {done.id && (
          <code className="block text-xs font-mono bg-muted/60 rounded-lg px-3 py-2 break-all">
            {done.id}
          </code>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setDone(null)}
          className="underline underline-offset-2"
        >
          {t`Ouvrir un autre dossier`}
        </Button>
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t`Nom (optionnel)`}
          maxLength={100}
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t`E-mail *`}
          type="email"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t`Type de demande`}
          hideLabel
          value={kind}
          onValueChange={setKind}
          options={getKinds()}
        />
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t`Sujet (5 caractères minimum) *`}
          maxLength={200}
        />
      </div>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t`Décrivez le problème… *`}
        rows={5}
      />
      {error && <p className="text-xs text-destructive-text">{error}</p>}
      <Button
        variant="solid"
        tone="neutral"
        disabled={sending || !valid}
        onClick={() => void submit()}
      >
        {sending ? t`Envoi…` : t`Envoyer`}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        {t`3 dossiers maximum par jour et par adresse (anti-spam).`}
      </p>
    </div>
  );
}
