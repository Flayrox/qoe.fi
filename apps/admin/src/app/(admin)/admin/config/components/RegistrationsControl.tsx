'use client';

// =====================================================================
// 🚪 RegistrationsControl — Inscriptions ouvertes/privées + allowlist
// =====================================================================
// 📖 Kill-switch prod des inscriptions (ALLOW_NEW_REGISTRATIONS) : ouvert =
//    tout le monde peut s'inscrire, fermé = seuls les emails invités
//    (allowlist, usage unique) passent le POST /v1/me/sync. Les comptes
//    existants ne sont jamais touchés.
// =====================================================================

import { useState, useTransition } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import {
  setRegistrationsOpenAction,
  addAllowlistAction,
  deleteAllowlistAction,
} from '@/lib/admin-aux-actions';
import type { AllowlistEntry } from '@/lib/admin-data';
import { cn } from '@qoe/utils';

export function RegistrationsControl({
  initialOpen,
  initialAllowlist,
}: {
  initialOpen: boolean;
  initialAllowlist: AllowlistEntry[];
}) {
  const [open, setOpen] = useState(initialOpen);
  const [entries, setEntries] = useState<AllowlistEntry[]>(initialAllowlist);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await setRegistrationsOpenAction(next);
      if (!res.success) {
        setOpen(!next);
        setErrorMsg(res.error ?? 'Erreur lors du changement de statut');
      }
    });
  };

  const handleAdd = () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await addAllowlistAction(trimmedEmail, note);
      if (!res.success) {
        setErrorMsg(res.error ?? "Erreur lors de l'invitation");
        return;
      }
      setEntries((prev) => [
        {
          email: trimmedEmail.toLowerCase(),
          note: note.trim() || null,
          invitedBy: null,
          usedAt: null,
          usedBy: null,
          createdAt: new Date().toISOString(),
        },
        ...prev.filter((e) => e.email.toLowerCase() !== trimmedEmail.toLowerCase()),
      ]);
      setEmail('');
      setNote('');
    });
  };

  const handleDelete = (target: string) => {
    if (!confirm(`Retirer l'invitation de ${target} ?`)) return;
    setEntries((prev) => prev.filter((e) => e.email !== target));
    startTransition(async () => {
      const res = await deleteAllowlistAction(target);
      if (!res.success) setErrorMsg(res.error ?? 'Erreur de suppression');
    });
  };

  const pendingCount = entries.filter((e) => !e.usedAt).length;

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">Inscriptions</h2>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              open ? 'bg-success/15 text-success' : 'bg-highlight/10 text-highlight'
            )}
          >
            {open ? 'Ouvertes' : 'Privées (sur invitation)'}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Kill-switch prod : fermées, seuls les emails invités ci-dessous peuvent créer un compte.
          Les comptes existants continuent de fonctionner.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Autoriser les nouvelles inscriptions
          </p>
          <p className="text-xs text-muted-foreground">
            {open
              ? 'Tout le monde peut s’inscrire.'
              : 'Seuls les emails invités peuvent s’inscrire.'}
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleToggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50',
            open ? 'bg-primary' : 'bg-muted'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
              open ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">
          Emails invités{' '}
          <span className="text-muted-foreground font-medium">
            ({pendingCount} en attente / {entries.length})
          </span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="ami@example.com"
            className="bg-muted border border-border px-3 py-2 rounded-lg text-sm outline-none focus:border-border"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Note (optionnel)"
            className="bg-muted border border-border px-3 py-2 rounded-lg text-sm outline-none focus:border-border"
          />
          <button
            type="button"
            disabled={isPending || !email.trim()}
            onClick={handleAdd}
            className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-[var(--qoe-vermillion)] hover:bg-[var(--qoe-vermillion)]/90 px-5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
            Inviter
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6 bg-muted/50 rounded-xl border border-border/30">
            Aucun email invité. Ajoutez l’email de la personne pour qu’elle puisse s’inscrire en
            mode privé.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {entries.map((e) => (
              <li
                key={e.email}
                className="flex items-center justify-between gap-3 px-4 py-2.5 bg-card"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{e.email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {e.usedAt ? '✅ Compte créé' : '⏳ En attente'}
                    {e.note ? ` — ${e.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(e.email)}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1.5"
                  title="Retirer l'invitation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
