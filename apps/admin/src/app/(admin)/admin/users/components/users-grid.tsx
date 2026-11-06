'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { GridViewToolbar } from '@/components/shell/GridView';
import {
  filterRows,
  useGridView,
  type GridFacetDef,
  type GridViewState,
} from '@/components/shell/grid-view';
import type { RowActionItem } from '@/components/shell/RowMenu';
import {
  attemptWithStepUp,
  isFailure,
  notifyActionFailure,
  readMessage,
} from '@/lib/authz-feedback';
import {
  suspendUserAction,
  toggleUserCertificationAction,
  toggleUserShadowbanAction,
  unsuspendUserAction,
} from '@/lib/admin-actions';

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  isCertified: boolean;
  isShadowbanned: boolean;
  isSuspended: boolean;
  createdAt: string;
  subdomain: string | null;
}

const STATUS_RANK = ['Banni', 'Shadowban', 'Certifié', 'Actif'];

const STATUS_TONE: Record<string, string> = {
  Banni: 'border-destructive/20 bg-destructive/10 text-destructive-text',
  Shadowban: 'border-highlight/40 bg-highlight/15 text-highlight',
  Certifié: 'border-neural-blue/30 bg-neural-blue/10 text-neural-blue',
  Actif: 'border-success/20 bg-success/10 text-success-text',
};

function statusOf(user: AdminUserRow): string {
  if (user.isSuspended) return 'Banni';
  if (user.isShadowbanned) return 'Shadowban';
  if (user.isCertified) return 'Certifié';
  return 'Actif';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

// =====================================================================
// 👥 UsersGrid — la liste de modération, dense et triable
// =====================================================================
// Les actions destructrices restent derrière `attemptWithStepUp` : un refus
// N2 ouvre la vérification puis rejoue l'action. Le résultat s'affiche en
// ligne (« Audité · à … ») plutôt qu'en toast.
// =====================================================================

export function UsersGrid({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const grid = useGridView('admin.users', { column: 'created', direction: 'descending' });

  const moderate = (action: () => Promise<unknown>, done: string) => {
    startTransition(async () => {
      const result = await attemptWithStepUp(action);
      if (isFailure(result)) {
        notifyActionFailure(result, readMessage(result) ?? 'Modération impossible');
        return;
      }
      setStatus(`${done} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
    });
  };

  const menu = (user: AdminUserRow): RowActionItem[] => [
    {
      id: 'open',
      label: 'Ouvrir la fiche',
      onSelect: () => router.push(`/admin/users/${user.id}`),
    },
    {
      id: 'certify',
      label: user.isCertified ? 'Retirer la certification' : 'Certifier le créateur',
      onSelect: () =>
        moderate(
          () =>
            toggleUserCertificationAction({
              userId: user.id,
              isCertified: !user.isCertified,
            }),
          user.isCertified ? 'Certification retirée' : 'Créateur certifié'
        ),
    },
    {
      id: 'shadowban',
      label: user.isShadowbanned ? 'Lever le shadowban' : 'Appliquer un shadowban',
      onSelect: () =>
        moderate(
          () =>
            toggleUserShadowbanAction({
              userId: user.id,
              isShadowbanned: !user.isShadowbanned,
            }),
          user.isShadowbanned ? 'Shadowban levé' : 'Shadowban appliqué'
        ),
    },
    {
      id: 'suspend',
      label: user.isSuspended ? 'Débannir le compte' : 'Bannir le compte',
      tone: user.isSuspended ? 'default' : 'danger',
      onSelect: () => {
        if (user.isSuspended) {
          moderate(() => unsuspendUserAction(user.id), 'Compte débanni');
          return;
        }
        const reason = window.prompt('Raison du bannissement :');
        if (!reason) return;
        moderate(() => suspendUserAction({ userId: user.id, reason }), 'Compte banni');
      },
    },
    {
      id: 'copy',
      label: 'Copier l’identifiant',
      shortcut: '⌘C',
      onSelect: () => void navigator.clipboard.writeText(user.id),
    },
  ];

  const columns: GridColumn<AdminUserRow>[] = [
    {
      id: 'person',
      header: 'Utilisateur',
      sort: { kind: 'text', value: (user) => user.email },
      cell: (user) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {user.name || 'Sans nom'}
          </span>
          <span className="max-w-[220px] truncate text-muted-foreground">{user.email}</span>
          <CopyableId id={user.id} max={6} />
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Rôle',
      width: 110,
      sort: { kind: 'text', value: (user) => user.role },
      cell: (user) => (
        <span className="rounded border border-border bg-muted px-1.5 py-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {user.role}
        </span>
      ),
    },
    {
      id: 'domain',
      header: 'Domaine',
      sort: { kind: 'text', value: (user) => user.subdomain ?? '' },
      cell: (user) =>
        user.subdomain ? (
          <span className="text-muted-foreground">{user.subdomain}.qoe.fi</span>
        ) : (
          <span className="text-muted-foreground/60">non configuré</span>
        ),
    },
    {
      id: 'status',
      header: 'Statut',
      width: 120,
      sort: { kind: 'rank', rank: STATUS_RANK, value: statusOf },
      cell: (user) => {
        const state = statusOf(user);
        return (
          <span
            className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${STATUS_TONE[state]}`}
          >
            {state}
          </span>
        );
      },
    },
    {
      id: 'created',
      header: 'Inscrit',
      width: 110,
      align: 'right',
      sort: { kind: 'number', value: (user) => new Date(user.createdAt).getTime() },
      cell: (user) => (
        <span className="tabular-nums text-muted-foreground">{formatDate(user.createdAt)}</span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<AdminUserRow>[] = [
    {
      id: 'role',
      label: 'Rôle',
      values: [...new Set(users.map((user) => user.role))].sort().map((role) => ({
        id: role,
        label: role,
        test: (row) => row.role === role,
      })),
    },
    {
      id: 'status',
      label: 'Statut',
      values: STATUS_RANK.map((state) => ({
        id: state,
        label: state,
        test: (row) => statusOf(row) === state,
      })),
    },
  ];
  const visible = filterRows(users, grid.state.facets, facetDefs);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Comptes</h1>
        <p className="text-[11px] text-muted-foreground">
          {users.length} comptes · clic droit pour modérer
          {pending && ' · enregistrement…'}
        </p>
      </div>
      {status && (
        <p role="status" className="text-[11px] text-muted-foreground">
          {status}
        </p>
      )}
      <GridViewToolbar
        state={grid.state}
        onChange={grid.update}
        onToggleFacet={grid.toggleFacet}
        onToggleColumn={grid.toggleColumn}
        onMoveColumn={(id, delta) =>
          grid.moveColumn(
            id,
            delta,
            columns.map((column) => column.id)
          )
        }
        onReset={grid.reset}
        facets={facetDefs}
        columns={columns.map((column) => ({ id: column.id, label: column.id }))}
        views={grid.views}
        onSaveView={grid.saveView}
        onApplyView={grid.applyView}
        onRemoveView={grid.removeView}
        count={visible.length}
      />
      <DataGrid
        ariaLabel="Comptes de la plateforme"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'created', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun compte ne correspond."
        rowMenu={menu}
      />
    </div>
  );
}
