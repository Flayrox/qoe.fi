'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { grantRoleAction } from '@/lib/admin-access-actions';
import { useStaffAction } from '@/components/queue/useStaffAction';
import { Button } from '@qoe/ui/button';
import { Callout } from '@qoe/ui/callout';
import { Icon } from '@qoe/ui/icons';
import { Input } from '@qoe/ui/input';
import { SectionHeader } from '@qoe/ui/section-header';
import { Select } from '@qoe/ui/select';
import type { AccessPersonSummary, AccessRoleRow } from '@/lib/admin-access-data';

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
    <section className="space-y-4 rounded-panel border border-border/60 bg-card p-5">
      <SectionHeader
        eyebrow="Accès"
        title="Attribuer un rôle"
        description="La personne doit déjà avoir un compte. L’attribution prend effet immédiatement et le motif est conservé."
        actions={
          <Button
            variant={showForm ? 'outline' : 'solid'}
            tone="brand"
            size="sm"
            onClick={() => setShowForm((open) => !open)}
            disabled={!canGrant}
            data-testid="access-grant-toggle"
            aria-expanded={showForm}
          >
            <Icon name={showForm ? 'x' : 'plus'} />
            {showForm ? 'Fermer' : 'Nouvelle attribution'}
          </Button>
        }
      />

      {!canGrant && (
        <Callout tone="info" live>
          <span data-testid="access-grant-readonly">
            Vous pouvez lire les attributions, pas les modifier : la capacité{' '}
            <span className="font-mono tabular-nums">admin.access.grant</span> est requise.
          </span>
        </Callout>
      )}

      {canGrant && (
        <form
          method="get"
          action="/admin/access"
          className="flex gap-2"
          data-testid="access-person-search"
        >
          <Input
            size="sm"
            name="person"
            defaultValue=""
            placeholder="Chercher une personne (email, pseudonyme, nom) — au moins 2 caractères"
            aria-label="Chercher une personne"
            className="flex-1"
            data-testid="access-person-search-input"
          />
          <Button type="submit" variant="outline" size="sm" className="whitespace-nowrap">
            <Icon name="search" />
            Chercher
          </Button>
        </form>
      )}

      {canGrant && people.length > 0 && showForm && (
        <div className="space-y-3 border-t border-border/40 pt-4" data-testid="access-grant-form">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              Personne
              <Select
                label="Personne"
                hideLabel
                testId="access-grant-person"
                value={userId}
                onValueChange={setUserId}
                options={people.map((person) => ({
                  id: person.userId,
                  label: `${person.email}${person.roles.length > 0 ? ` (${person.roles.join(', ')})` : ''}`,
                }))}
              />
            </label>
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              Rôle
              <Select
                label="Rôle"
                hideLabel
                testId="access-grant-role"
                value={roleKey}
                onValueChange={setRoleKey}
                options={roles.map((role) => ({
                  id: role.key,
                  label: `${role.label} — ${role.capabilities.length} capacité(s)`,
                }))}
              />
            </label>
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              Échéance (vide = sans fin)
              <Input
                size="sm"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                aria-label="Échéance du rôle"
                data-testid="access-grant-expires"
              />
            </label>
          </div>

          {selected?.legacySuperadmin && (
            <Callout tone="neutral">
              {selected.email} est superadmin historique : il détient déjà toutes les capacités.
            </Callout>
          )}

          <Input
            size="sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (obligatoire, au moins 5 caractères) — ex. « renfort modération octobre »"
            aria-label="Motif de l’attribution"
            data-testid="access-grant-reason"
          />

          <Button
            variant="solid"
            tone="brand"
            size="sm"
            loading={loadingId === 'grant'}
            onClick={() => void submit()}
            disabled={!userId || !roleKey || reason.trim().length < 5}
            data-testid="access-grant-submit"
          >
            Attribuer
          </Button>
        </div>
      )}
    </section>
  );
}
