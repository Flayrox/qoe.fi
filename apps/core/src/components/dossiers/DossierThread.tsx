'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';

// Fil de discussion d'un dossier (lot 2b) : partagé par les recours
// (/recours) et le support (/support) — même rendu, mêmes règles : mes
// messages à gauche (fond neutre), ceux du staff en retrait (highlight) ;
// dossier clos = hint, pas de composer. Le dépôt initial et les statuts
// restent aux pages (métiers différents).
export interface ThreadMessage {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface DossierThreadProps {
  messages: ThreadMessage[];
  viewerId: string;
  canWrite: boolean;
  closedHint: string;
  placeholder?: string;
  sending: boolean;
  // Retourne true si l'envoi a réussi (le champ n'est effacé qu'alors —
  // jamais de perte d'écrit en cas d'échec).
  onSend: (body: string) => Promise<boolean>;
}

export function DossierThread({
  messages,
  viewerId,
  canWrite,
  closedHint,
  placeholder = 'Écrire au dossier…',
  sending,
  onSend,
}: DossierThreadProps) {
  const [body, setBody] = useState('');

  return (
    <div className="space-y-2 pt-2">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`text-xs rounded-xl px-3 py-2 ${
            m.authorId === viewerId ? 'bg-muted/60' : 'bg-highlight/10 border border-highlight/30'
          }`}
        >
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {m.authorId === viewerId ? 'Vous' : 'Staff'} · {new Date(m.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
      {canWrite ? (
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-border outline-none"
          />
          <button
            disabled={sending || body.trim().length < 1}
            onClick={() =>
              void onSend(body.trim()).then((ok) => {
                if (ok) setBody('');
              })
            }
            className="text-xs font-bold px-3 py-2 rounded-xl bg-foreground text-background cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{closedHint}</p>
      )}
    </div>
  );
}
