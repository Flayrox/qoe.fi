'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';
import { grantRoleAction } from '@/lib/admin-access-actions';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { AccessPersonSummary, AccessRoleRow } from '@/lib/admin-access-data';

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';

interface AccessGrantFormProps {
  /** Personnes trouvées par la recherche (`?person=`), déjà filtrées côté serveur. */
  people: AccessPersonSummary[];
  roles: AccessRoleRow[];
  canGrant: boolean;
}

/**
 * Attribution d'un rôle : chercher la personne, choisir le rôle, dater si
 * besoin, et DIRE POURQUOI. Le motif n'est pas décoratif — il part dans le
 * journal d'audit et le serveur refuse un motif vide.
 */
export function AccessGrantForm({ people, roles, canGrant }: AccessGrantFormProps) {
  const router = useRouter();
  const { loadingId, run } = useStaffAction<string>();
  const [showForm, setShowForm] = useState(people.length > 0);
  const [userId, setUserId] = useState(people[0]?.userId ?? '');
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const selected = people.find((person) => person.userId === userId);

  const submit = async () => {
    const res = await run('grant', () => grantRoleAction({ userId, roleKey, expiresAt, reason }), {
      ok: 'Rôle attribué — la personne ouvre la console dès maintenant',
    });
    if (res?.ok) {
      setReason('');
      setExpiresAt('');
      router.refresh();
    }
  };

  return (
    <section className="bg-white border border-border rounded-3xl p-6 shadow-sm space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Attribuer un rôle</h2>
          <p className="text-xs text-muted-foreground">
            La personne doit déjà avoir un compte. L’attribution prend effet immédiatement et le
            motif est conservé.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          disabled={!canGrant}
          data-testid="access-grant-toggle"
          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" />
          {showForm ? 'Fermer' : 'Nouvelle attribution'}
        </button>
      </header>

      {!canGrant && (
        <p className="text-xs text-muted-foreground" data-testid="access-grant-readonly">
          Vous pouvez lire les attributions, pas les modifier : la capacité{' '}
          <span className="font-mono">admin.access.grant</span> est requise.
        </p>
      )}

      {canGrant && (
        <form
          method="get"
          action="/admin/access"
          className="flex gap-2"
          data-testid="access-person-search"
        >
          <input
            name="person"
            defaultValue=""
            placeholder="Chercher une personne (email, pseudonyme, nom) — au moins 2 caractères"
            className={inputCls}
            data-testid="access-person-search-input"
          />
          <button
            type="submit"
            className="text-xs font-bold px-3 py-2 rounded-xl border border-border cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Search className="w-3 h-3" /> Chercher
          </button>
        </form>
      )}

      {canGrant && people.length > 0 && showForm && (
        <div className="space-y-3 border-t border-border pt-4" data-testid="access-grant-form">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-[11px] text-muted-foreground space-y-1 block">
              Personne
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={inputCls}
                data-testid="access-grant-person"
              >
                {people.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.email}
                    {person.roles.length > 0 ? ` (${person.roles.join(', ')})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1 block">
              Rôle
              <select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                className={inputCls}
                data-testid="access-grant-role"
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label} — {role.capabilities.length} capacité(s)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1 block">
              Échéance (vide = sans fin)
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputCls}
                data-testid="access-grant-expires"
              />
            </label>
          </div>
          {selected?.legacySuperadmin && (
            <p className="text-[11px] text-muted-foreground">
              {selected.email} est superadmin historique : il détient déjà toutes les capacités.
            </p>
          )}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (obligatoire, au moins 5 caractères) — ex. « renfort modération octobre »"
            className={inputCls}
            data-testid="access-grant-reason"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loadingId !== null || !userId || !roleKey || reason.trim().length < 5}
            data-testid="access-grant-submit"
            className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingId === 'grant' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            Attribuer
          </button>
        </div>
      )}
    </section>
  );
}
