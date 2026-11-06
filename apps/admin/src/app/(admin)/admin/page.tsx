import Link from 'next/link';
import { ArrowRight, AlertTriangle, Inbox, ShieldX, UserCheck } from 'lucide-react';
import type {
  AdminQueuePriority,
  AdminQueueSLAState,
  AdminQueueTriageEntry,
} from '@/lib/admin-data';
import { getAdminWorkQueue } from '@/lib/admin-data';
import { getPlatformHealth } from '@/lib/admin-infra-data';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import {
  AdminEmptyRow,
  AdminTable,
  AdminTBody,
  AdminTd,
  AdminTh,
  AdminTHead,
  AdminTr,
} from '@/components/shell/AdminTable';
import { CopyableId } from '@/components/shell/CopyableId';
import { DENSITY } from '@/components/shell/tokens';

export const dynamic = 'force-dynamic';

const PRIORITY_LABELS: Record<AdminQueuePriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

const SLA_LABELS: Record<AdminQueueSLAState, string> = {
  breached: 'SLA dépassé',
  due_soon: 'Échéance proche',
  on_track: 'Dans les temps',
  closed: 'Fermé',
};

const SLA_TONE: Record<AdminQueueSLAState, string> = {
  breached: 'border-destructive/20 bg-destructive/10 text-destructive-text',
  due_soon: 'border-highlight/40 bg-highlight/15 text-highlight',
  on_track: 'border-success/20 bg-success/10 text-success-text',
  closed: 'border-border bg-muted text-muted-foreground',
};

const SLA_RANK: Record<AdminQueueSLAState, number> = {
  breached: 0,
  due_soon: 1,
  on_track: 2,
  closed: 3,
};

const PRIORITY_RANK: Record<AdminQueuePriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Les urgences d'abord, puis la priorité, puis l'échéance la plus proche. */
function prioritize(entries: readonly AdminQueueTriageEntry[]): AdminQueueTriageEntry[] {
  return [...entries].sort((a, b) => {
    const sla = SLA_RANK[a.slaState] - SLA_RANK[b.slaState];
    if (sla !== 0) return sla;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
  });
}

/** Une tuile de la bande de chiffres : libellé, valeur, lien optionnel. */
function StatTile({
  label,
  value,
  detail,
  href,
  alert,
}: {
  label: string;
  value: number;
  detail?: string;
  href?: string;
  alert?: boolean;
}) {
  const content = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-xl font-semibold tabular-nums ${alert ? 'text-destructive-text' : 'text-foreground'}`}
      >
        {value.toLocaleString('fr-FR')}
      </span>
      {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
    </>
  );

  const className = 'flex flex-col gap-0.5 bg-card px-4 py-3 transition-colors';
  if (!href) return <div className={className}>{content}</div>;
  return (
    <Link href={href} className={`${className} hover:bg-muted/50`}>
      {content}
    </Link>
  );
}

export default async function AdminDashboard() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const [work, health] = await Promise.all([getAdminWorkQueue(), getPlatformHealth()]);

  const capabilities = new Set(identity?.capabilities ?? []);
  const openTotal = work.items.reduce((sum, item) => sum + item.count, 0);
  const queueLabels = new Map(work.items.map((item) => [item.key, item.label]));
  const triage = prioritize(work.entries);

  // « Erreurs » = ce qui rend la supervision ou les sondes fausses, pas un
  // compteur métier. Une sonde muette compte pour une erreur : la console ne
  // doit pas afficher zéro quand elle ne sait pas.
  const probeErrors = health
    ? (health.postgres?.ok === false ? 1 : 0) +
      (health.migration?.error ? 1 : 0) +
      (health.decisions.recorder.dropped > 0 ? 1 : 0)
    : 1;

  const denied = health?.decisions.last24h.deniedEnforced ?? 0;
  const allowed = health?.decisions.last24h.allowed ?? 0;

  return (
    <div className="space-y-5 font-sans">
      <QueuePageHeader
        icon={<Inbox className="size-4" />}
        title="Pilotage"
        badge={openTotal > 0 ? `${openTotal} à traiter` : null}
        description="Ce qui attend une décision. Les chiffres viennent des files et des sondes, aucune série n'est simulée."
        actions={
          <Link
            href="/admin/work"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#EE4B2B] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#d8411f]"
          >
            Ouvrir Ma file
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <section
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:grid-cols-5"
        aria-label="Chiffres du jour"
      >
        <StatTile label="À traiter" value={openTotal} detail="six files" href="/admin/work" />
        <StatTile
          label="SLA dépassés"
          value={work.breached}
          detail="à traiter en premier"
          href="/admin/work"
          alert={work.breached > 0}
        />
        <StatTile
          label="Assignés à moi"
          value={work.assignedToMe}
          detail="dossiers ouverts"
          href="/admin/work"
        />
        <StatTile
          label="Refus 24 h"
          value={denied}
          detail={`${allowed.toLocaleString('fr-FR')} accords`}
          href={capabilities.has('admin.audit.read') ? '/admin/access/decisions' : undefined}
          alert={denied > 0}
        />
        <StatTile
          label="Erreurs"
          value={probeErrors}
          detail="sondes et journal"
          href="/admin/health"
          alert={probeErrors > 0}
        />
      </section>

      <section className="space-y-2" data-testid="admin-dashboard-work">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold">À traiter</h2>
          <p className="text-[11px] text-muted-foreground">
            Trié par SLA, puis priorité, puis échéance.
          </p>
        </div>

        <AdminTable minWidth="760px">
          <AdminTHead>
            <tr>
              <AdminTh>Dossier</AdminTh>
              <AdminTh>Assigné à</AdminTh>
              <AdminTh>Priorité</AdminTh>
              <AdminTh>SLA</AdminTh>
              <AdminTh>Échéance</AdminTh>
            </tr>
          </AdminTHead>
          <AdminTBody>
            {triage.length === 0 ? (
              <AdminEmptyRow colSpan={5}>
                Aucun dossier ouvert : les six files sont vides.
              </AdminEmptyRow>
            ) : (
              triage.slice(0, 15).map((entry) => (
                <AdminTr key={`${entry.queue}:${entry.id}`}>
                  <AdminTd>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-[92px] shrink-0 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                        {queueLabels.get(entry.queue) ?? entry.queue}
                      </span>
                      <Link
                        href={entry.href}
                        className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
                        title={entry.title}
                      >
                        {entry.title}
                      </Link>
                      <CopyableId id={entry.id} max={6} />
                    </div>
                  </AdminTd>
                  <AdminTd className="text-[12px] text-muted-foreground">
                    {entry.assignedName ?? 'Libre'}
                  </AdminTd>
                  <AdminTd className="text-[12px] text-muted-foreground">
                    {PRIORITY_LABELS[entry.priority]}
                  </AdminTd>
                  <AdminTd>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${SLA_TONE[entry.slaState]}`}
                    >
                      {SLA_LABELS[entry.slaState]}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDue(entry.dueAt ?? entry.slaDueAt)}
                  </AdminTd>
                </AdminTr>
              ))
            )}
          </AdminTBody>
        </AdminTable>

        {triage.length > 15 && (
          <p className="text-[11px] text-muted-foreground">
            {triage.length - 15} autres dossiers dans{' '}
            <Link href="/admin/work" className="text-[#EE4B2B] hover:underline">
              Ma file
            </Link>
            .
          </p>
        )}
      </section>

      <section
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground"
        data-testid="admin-dashboard-health"
      >
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          {probeErrors > 0 ? (
            <AlertTriangle className="size-3.5 text-destructive-text" aria-hidden />
          ) : (
            <ShieldX className="size-3.5 text-success-text" aria-hidden />
          )}
          Santé
        </span>
        <span>
          Postgres {health?.postgres?.ok ? `${health.postgres.latencyMs} ms` : 'indisponible'}
        </span>
        <span>Migration {health?.migration ? `v${health.migration.applied}` : '—'}</span>
        <span className={health?.mode === 'enforce' ? 'text-foreground' : 'text-highlight'}>
          Autorisation {health?.mode === 'enforce' ? 'refus armé' : 'observation'}
        </span>
        <span>
          Journal {health ? health.decisions.recorder.written.toLocaleString('fr-FR') : '—'} écrites
          {health && health.decisions.recorder.dropped > 0
            ? ` · ${health.decisions.recorder.dropped} perdues`
            : ''}
        </span>
        <Link href="/admin/health" className="font-medium text-[#EE4B2B] hover:underline">
          Détail santé
        </Link>
        <Link href="/admin/system" className="font-medium text-[#EE4B2B] hover:underline">
          Couverture
        </Link>
      </section>

      {capabilities.has('admin.users.read') && (
        <section className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <UserCheck className="size-3.5" aria-hidden />
          <Link href="/admin/users" className="hover:underline">
            Comptes & modération
          </Link>
          <span className="opacity-60">·</span>
          <span className={DENSITY.id}>/admin/users</span>
        </section>
      )}
    </div>
  );
}
