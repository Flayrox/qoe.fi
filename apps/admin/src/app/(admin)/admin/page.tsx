import Link from 'next/link';
import {
  ArrowRight,
  Crown,
  Database,
  FileText,
  GitBranch,
  Inbox,
  LayoutDashboard,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  getAdminDashboard,
  getAdminWorkQueue,
  type AdminQueuePriority,
  type AdminQueueSLAState,
  type AdminQueueTriageEntry,
} from '@/lib/admin-data';
import { getPlatformHealth } from '@/lib/admin-infra-data';
import { apiOnlyRoutes, coverageRatio } from '@/lib/admin-coverage';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { StatusPill } from '@/components/queue/StatusPill';

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

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
        {value.toLocaleString('fr-FR')}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </>
  );

  const className = 'rounded-3xl border border-border bg-white p-5 shadow-sm';
  if (!href) return <div className={className}>{content}</div>;

  return (
    <Link href={href} className={`${className} transition-colors hover:border-foreground/20`}>
      {content}
    </Link>
  );
}

/** Les urgences d'abord, puis l'échéance la plus proche. */
function prioritize(entries: readonly AdminQueueTriageEntry[]): AdminQueueTriageEntry[] {
  return [...entries]
    .sort((a, b) => {
      const sla = SLA_RANK[a.slaState] - SLA_RANK[b.slaState];
      if (sla !== 0) return sla;
      const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority !== 0) return priority;
      return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
    })
    .slice(0, 6);
}

export default async function AdminDashboard() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const [counts, work, health] = await Promise.all([
    getAdminDashboard(),
    getAdminWorkQueue(),
    getPlatformHealth(),
  ]);

  const capabilities = new Set(identity?.capabilities ?? []);
  const openTotal = work.items.reduce((sum, item) => sum + item.count, 0);
  const topEntries = prioritize(work.entries);
  const queueLabels = new Map(work.items.map((item) => [item.key, item.label]));

  const coverage = coverageRatio();
  const orphans = apiOnlyRoutes();

  return (
    <div className="mx-auto max-w-6xl space-y-10 font-sans">
      <QueuePageHeader
        icon={<LayoutDashboard className="h-4 w-4" />}
        title="Pilotage"
        badge={openTotal > 0 ? `${openTotal} à traiter` : null}
        description="Ce qui attend une décision, les compteurs réels et l'état des sondes. Aucune série n'est simulée."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Comptes"
          value={counts.users}
          detail="Comptes enregistrés"
          icon={Users}
          href={capabilities.has('admin.users.read') ? '/admin/users' : undefined}
        />
        <KpiCard
          label="Créateurs"
          value={counts.creators}
          detail="Profils créateurs"
          icon={PenLine}
        />
        <KpiCard
          label="Articles"
          value={counts.articles}
          detail="Articles en base"
          icon={FileText}
        />
        <KpiCard
          label="Abonnés premium"
          value={counts.premiumSubscribers}
          detail="Abonnements actifs"
          icon={Crown}
          href={capabilities.has('admin.subscriptions.read') ? '/admin/subscriptions' : undefined}
        />
      </div>

      <section className="space-y-4" data-testid="admin-dashboard-work">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">À traiter</h2>
            <p className="text-xs text-muted-foreground">
              Les six files métier, leurs SLA et les dossiers les plus urgents.
            </p>
          </div>
          <Link
            href="/admin/work"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#EE4B2B] hover:underline"
          >
            Ouvrir Ma file <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" aria-hidden /> Dossiers ouverts
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {openTotal.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden /> Assignés à moi
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {work.assignedToMe.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> SLA dépassés
            </div>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums ${
                work.breached > 0 ? 'text-destructive-text' : 'text-foreground'
              }`}
            >
              {work.breached.toLocaleString('fr-FR')}
            </p>
          </div>
        </div>

        {work.items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            Aucune file accessible pour votre rôle.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {work.items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="group rounded-2xl border border-border bg-white p-4 shadow-sm transition-colors hover:border-foreground/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium">{item.label}</span>
                  <span className="text-2xl font-semibold tabular-nums">{item.count}</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {item.assignedToMe} à moi ·{' '}
                  {item.breached > 0
                    ? `${item.breached} SLA dépassé${item.breached > 1 ? 's' : ''}`
                    : 'aucun SLA dépassé'}
                </p>
              </Link>
            ))}
          </div>
        )}

        {topEntries.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Dossier</th>
                  <th className="px-4 py-3 font-medium">Assigné à</th>
                  <th className="px-4 py-3 font-medium">Priorité</th>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {topEntries.map((entry) => (
                  <tr key={`${entry.queue}:${entry.id}`} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {queueLabels.get(entry.queue) ?? entry.queue}
                      </p>
                      <Link
                        href={entry.href}
                        className="mt-0.5 block text-sm font-medium hover:underline"
                      >
                        {entry.title}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">{entry.status}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {entry.assignedName ?? <span className="text-muted-foreground">Libre</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">{PRIORITY_LABELS[entry.priority]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${SLA_TONE[entry.slaState]}`}
                      >
                        {SLA_LABELS[entry.slaState]}
                      </span>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDue(entry.dueAt ?? entry.slaDueAt)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            Rien n'est en attente. Les six files sont vides.
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className="rounded-3xl border border-border bg-white p-6 shadow-sm lg:col-span-2"
          data-testid="admin-dashboard-health"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Santé</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Base, migration appliquée et mode d'autorisation.
              </p>
            </div>
            <Link
              href="/admin/health"
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
            >
              Détail <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {health ? (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Database className="h-3.5 w-3.5" aria-hidden /> Postgres
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {health.postgres?.ok ? `${health.postgres.latencyMs} ms` : 'Indisponible'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {health.postgres?.ok
                      ? 'Aller-retour mesuré.'
                      : (health.postgres?.error ?? 'Sonde de base indisponible.')}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <GitBranch className="h-3.5 w-3.5" aria-hidden /> Migration
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {health.migration ? `v${health.migration.applied}` : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {health.migration?.error ?? 'Version appliquée sur cette base.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {health.mode === 'enforce' ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Autorisation
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {health.mode === 'enforce' ? 'Refus armé' : 'Observation'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {health.mode === 'enforce'
                      ? 'Une capacité manquante répond 403.'
                      : 'Les refus sont journalisés, pas appliqués.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill>
                  {health.decisions.last24h.allowed.toLocaleString('fr-FR')} accords / 24 h
                </StatusPill>
                <StatusPill tone={health.decisions.last24h.deniedEnforced > 0 ? 'hot' : 'muted'}>
                  {health.decisions.last24h.deniedEnforced.toLocaleString('fr-FR')} refus appliqués
                </StatusPill>
                <StatusPill>
                  {health.decisions.last24h.deniedObserved.toLocaleString('fr-FR')} refus observés
                </StatusPill>
                <StatusPill tone={health.decisions.recorder.dropped > 0 ? 'hot' : 'muted'}>
                  journal : {health.decisions.recorder.written.toLocaleString('fr-FR')} écrites
                </StatusPill>
              </div>

              {health.decisions.recorder.dropped > 0 && (
                <p className="mt-3 text-xs text-destructive-text">
                  Des décisions ont été perdues faute de place : la supervision est incomplète.
                </p>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
              La sonde de santé ne répond pas.{' '}
              <Link href="/admin/health" className="underline">
                Ouvrir la page de santé
              </Link>{' '}
              pour voir l'erreur détaillée.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold">Couverture de la console</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{coverage.percent} %</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {coverage.covered}/{coverage.total} routes portées par un écran.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Les routes restantes sont assumées « API-only » avec leur raison, et le test de parité
            Go ↔ TS échoue si une route n'est plus classée.
          </p>
          {orphans.length > 0 && (
            <details className="mt-3 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer font-medium">
                Voir les {orphans.length} routes API-only
              </summary>
              <ul className="mt-2 space-y-1.5">
                {orphans.map((orphan) => (
                  <li key={orphan.key}>
                    <span className="font-mono">{orphan.key}</span> — {orphan.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
