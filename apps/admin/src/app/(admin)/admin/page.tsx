import Link from 'next/link';
import { AlertTriangle, ShieldCheck, Inbox } from 'lucide-react';
import { getAdminWorkQueue } from '@/lib/admin-data';
import { getPlatformHealth } from '@/lib/admin-infra-data';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { WorkTable } from './components/WorkTable';

export const dynamic = 'force-dynamic';

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
        className={`text-lg font-semibold tabular-nums ${alert ? 'text-destructive-text' : 'text-foreground'}`}
      >
        {value.toLocaleString('fr-FR')}
      </span>
      {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
    </>
  );

  const className = 'flex flex-col gap-0 bg-card px-3 py-2';
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
  const queueLabels = Object.fromEntries(work.items.map((item) => [item.key, item.label]));

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
    <div className="space-y-4 font-sans">
      <QueuePageHeader
        icon={<Inbox className="size-4" />}
        title="Pilotage"
        badge={openTotal > 0 ? `${openTotal} à traiter` : null}
        description="Ce qui attend une décision. Les chiffres viennent des files et des sondes, aucune série n'est simulée."
        actions={
          <Link
            href="/admin/work"
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[#EE4B2B] px-2 text-[12px] font-medium text-white transition-colors hover:bg-[#d8411f]"
          >
            Ouvrir Ma file
          </Link>
        }
      />

      <section
        className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 xl:grid-cols-5"
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

      <section className="space-y-1.5" data-testid="admin-dashboard-work">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold">À traiter</h2>
          <p className="text-[11px] text-muted-foreground">
            Trié par SLA, puis priorité, puis échéance.
          </p>
        </div>
        <WorkTable entries={work.entries} queueLabels={queueLabels} limit={20} />
        {work.entries.length > 20 && (
          <p className="text-[11px] text-muted-foreground">
            {work.entries.length - 20} autres dossiers dans{' '}
            <Link href="/admin/work" className="text-[#EE4B2B] hover:underline">
              Ma file
            </Link>
            .
          </p>
        )}
      </section>

      <section
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground"
        data-testid="admin-dashboard-health"
      >
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          {probeErrors > 0 ? (
            <AlertTriangle className="size-3.5 text-destructive-text" aria-hidden />
          ) : (
            <ShieldCheck className="size-3.5 text-success-text" aria-hidden />
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
    </div>
  );
}
