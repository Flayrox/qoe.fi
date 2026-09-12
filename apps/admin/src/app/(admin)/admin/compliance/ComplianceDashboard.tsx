import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cookie,
  FileWarning,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  ComplianceDocument,
  ComplianceObligation,
  ComplianceSnapshot,
} from '@/lib/admin-data';

const STATUS_STYLES: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: 'Conforme', className: 'text-success bg-success/10', icon: CheckCircle2 },
  warning: {
    label: 'À surveiller',
    className: 'text-highlight bg-highlight/10',
    icon: AlertTriangle,
  },
  critical: {
    label: 'Critique',
    className: 'text-destructive bg-destructive/10',
    icon: ShieldAlert,
  },
  soon: { label: 'Bientôt', className: 'text-highlight bg-highlight/10', icon: CalendarClock },
  overdue: {
    label: 'Dépassée',
    className: 'text-destructive bg-destructive/10',
    icon: ShieldAlert,
  },
  unknown: { label: 'Non suivi', className: 'text-muted-foreground bg-muted', icon: CalendarClock },
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function relativeDays(days?: number) {
  if (days === undefined || days === null) return '—';
  if (days < 0) return `${Math.abs(days)} j de retard`;
  if (days === 0) return "aujourd'hui";
  return `dans ${days} j`;
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.className}`}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  icon: typeof ShieldCheck;
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-highlight'
        : tone === 'success'
          ? 'text-success'
          : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CoverageBar({ document, eligible }: { document: ComplianceDocument; eligible: number }) {
  const percent = Math.max(0, Math.min(100, document.coveragePercent));
  const barClass =
    document.status === 'critical'
      ? 'bg-destructive'
      : document.status === 'warning'
        ? 'bg-highlight'
        : 'bg-success';
  return (
    <div className="min-w-[140px]">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {document.currentAcceptances} / {eligible} comptes
        </span>
        <span className="font-semibold text-foreground">{percent} %</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ComplianceDashboard({ snapshot }: { snapshot: ComplianceSnapshot }) {
  const { summary } = snapshot;
  const scoreTone = summary.score >= 85 ? 'success' : summary.score >= 60 ? 'warning' : 'danger';

  const documentsByRisk = [...snapshot.documents].sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 } as Record<string, number>;
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const dueObligations = [...snapshot.obligations].sort((a, b) => {
    const order = { overdue: 0, soon: 1, ok: 2, unknown: 3 } as Record<string, number>;
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Score de conformité"
          value={`${summary.score}/100`}
          tone={scoreTone as 'success' | 'warning' | 'danger'}
          icon={ShieldCheck}
          hint={`${summary.documentsTracked} document(s) suivi(s)`}
        />
        <Metric
          label="Documents critiques"
          value={summary.critical}
          tone={summary.critical > 0 ? 'danger' : 'success'}
          icon={FileWarning}
          hint={`${summary.missingPublications} sans version publiée`}
        />
        <Metric
          label="Échéances dépassées"
          value={summary.overdueObligations}
          tone={summary.overdueObligations > 0 ? 'danger' : 'success'}
          icon={CalendarClock}
          hint="Revues réglementaires en retard"
        />
        <Metric
          label="Consentements manquants"
          value={snapshot.usersWithGaps}
          tone={snapshot.usersWithGaps > 0 ? 'warning' : 'success'}
          icon={Users}
          hint={`${snapshot.pendingAcceptances} acceptation(s) en attente · ${snapshot.eligibleUsers} comptes actifs`}
        />
      </div>

      {/* ─── Échéances réglementaires ─── */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-5 py-4">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Échéances réglementaires</h2>
        </header>
        <ul className="divide-y divide-border">
          {dueObligations.map((obligation: ComplianceObligation) => (
            <li key={obligation.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{obligation.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {obligation.legal}
                </p>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                <p>
                  Dernière publication :{' '}
                  <span className="text-foreground">{formatDate(obligation.lastDone)}</span>
                </p>
                <p>
                  Prochaine revue :{' '}
                  <span className="text-foreground">{formatDate(obligation.nextDue)}</span>
                </p>
              </div>
              <div className="w-[130px] text-right">
                <StatusBadge status={obligation.status} />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {relativeDays(obligation.daysLeft)}
                </p>
              </div>
            </li>
          ))}
          {dueObligations.length === 0 && (
            <li className="px-5 py-4 text-sm text-muted-foreground">Aucune échéance définie.</li>
          )}
        </ul>
      </section>

      {/* ─── Couverture par document ─── */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-5 py-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Couverture du consentement</h2>
          <Link
            href="/admin/legal"
            className="ml-auto text-[11px] font-semibold text-primary underline"
          >
            Gérer le contenu juridique
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2 font-semibold">Document</th>
                <th className="px-3 py-2 font-semibold">Version</th>
                <th className="px-3 py-2 font-semibold">Locales</th>
                <th className="px-3 py-2 font-semibold">Couverture</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                <th className="px-5 py-2 font-semibold">Angles morts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documentsByRisk.map((doc) => (
                <tr key={doc.id} className="align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{doc.slug}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {doc.audience} · {doc.category}
                      {doc.requiresAcceptance ? ' · consentement obligatoire' : ''}
                      {!doc.isActive ? ' · désactivé' : ''}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground">
                    {doc.publishedVersion || <span className="text-destructive">aucune</span>}
                    {doc.draftsCount > 0 && (
                      <span className="ml-1 text-[10px]">({doc.draftsCount} brouillon)</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground">
                    {doc.distinctLocales}
                  </td>
                  <td className="px-3 py-3">
                    {doc.requiresAcceptance ? (
                      <CoverageBar document={doc} eligible={snapshot.eligibleUsers} />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">non requise</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-5 py-3">
                    {doc.issues.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {doc.issues.map((issue) => (
                          <li
                            key={issue}
                            className="text-[11px] leading-snug text-muted-foreground"
                          >
                            • {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Avis envoyés + traceurs ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Avis de nouvelle version envoyés
            </h2>
          </header>
          <ul className="divide-y divide-border">
            {snapshot.notices.map((notice) => (
              <li key={notice.id} className="px-5 py-3">
                <p className="text-sm font-medium text-foreground">
                  {notice.title} <span className="text-muted-foreground">v{notice.version}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(notice.createdAt)} · {notice.deliveries} destinataire(s) ·{' '}
                  <span className="text-success">{notice.sent} envoyé(s)</span>
                  {notice.failed > 0 && (
                    <span className="text-destructive"> · {notice.failed} en échec</span>
                  )}
                </p>
                {notice.changelog && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {notice.changelog}
                  </p>
                )}
              </li>
            ))}
            {snapshot.notices.length === 0 && (
              <li className="px-5 py-4 text-sm text-muted-foreground">
                Aucune nouvelle version publiée depuis la mise en place du suivi.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Cookie className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Choix de traceurs journalisés</h2>
          </header>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Choix enregistrés
              </p>
              <p className="text-2xl font-bold text-foreground">
                {snapshot.cookieConsent?.total ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground">
                dont {snapshot.cookieConsent?.last30d ?? 0} sur 30 jours
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Navigateurs distincts
              </p>
              <p className="text-2xl font-bold text-foreground">
                {snapshot.cookieConsent?.distinctBrowsers ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground">
                mesure d’audience : {snapshot.cookieConsent?.analyticsOptIn ?? 0} accord ·{' '}
                {snapshot.cookieConsent?.analyticsOptOut ?? 0} refus
              </p>
            </div>
            <div className="col-span-2 border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground">
              Journal append-only : chaque changement de choix ajoute une ligne, aucune preuve
              n&apos;est écrasée. Dernier choix {formatDate(snapshot.cookieConsent?.lastChoiceAt)}.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
