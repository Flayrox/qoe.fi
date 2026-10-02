'use client';

// =====================================================================
// 🧾 AuditLogClient — lire l'audit sans fouiller les logs
// =====================================================================
// Filtres (acteur, capacité, action, cible, période) appliqués côté serveur —
// un filtre client ne verrait que la page déjà chargée. Le diff avant/après est
// rendu en clair ; le CSV part du serveur avec LES MÊMES filtres.
// =====================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from 'lucide-react';
import { auditQuery, type AdminAuditEntry, type AuthzMode } from '@/lib/admin-audit-types';

const actionMeta: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  'api.access.status': { label: "Changement d'accès API", icon: ShieldCheck },
  'api.access.grants': { label: 'Permissions ajustées', icon: SlidersHorizontal },
  'api.access.modules': { label: 'Modules plateforme', icon: SlidersHorizontal },
  'access.control.config': { label: 'Contrôle d’accès global', icon: ShieldAlert },
  'moderation.update': { label: 'Modération', icon: UserCog },
  'access.grant': { label: 'Rôle attribué', icon: ShieldCheck },
  'access.revoke': { label: 'Rôle révoqué', icon: ShieldAlert },
};

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';

/** Rend un objet de diff en texte compact (jamais « [object Object] »). */
function compact(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries.map(([key, item]) => `${key}: ${item === null ? '—' : String(item)}`).join(' · ');
}

interface AuditLogClientProps {
  entries: AdminAuditEntry[];
  mode: AuthzMode;
  filters: {
    actor: string;
    capability: string;
    action: string;
    target: string;
    since: string;
    until: string;
    limit: number;
  };
}

export function AuditLogClient({ entries, mode, filters }: AuditLogClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(
    Boolean(
      filters.actor ||
      filters.capability ||
      filters.action ||
      filters.target ||
      filters.since ||
      filters.until
    )
  );

  const refresh = () => startTransition(() => router.refresh());
  const csvHref = `/admin/audit/export${auditQuery(filters, { format: 'csv' })}`;

  // Le mode OBSERVATION est un fait d'exploitation : il reste affiché tant qu'il
  // dure, au-dessus des données qu'il nuance.
  const banner =
    mode === 'observe' ? (
      <div
        data-testid="audit-mode-banner"
        className="rounded-2xl border border-highlight/40 bg-highlight/10 px-4 py-3 text-xs text-foreground"
      >
        <strong>Mode OBSERVATION</strong> — les refus d’autorisation sont journalisés mais{' '}
        <strong>pas encore appliqués</strong>. Le passage en{' '}
        <span className="font-mono">enforce</span> se décide sur le volume de refus observés
        (journal des décisions).
      </div>
    ) : (
      <div
        data-testid="audit-mode-banner"
        className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-xs text-foreground"
      >
        <strong>Mode REFUS (enforce)</strong> — une capacité manquante répond 403. Les refus listés
        ci-dessous ont été réellement bloqués.
      </div>
    );

  return (
    <div className="space-y-4">
      {banner}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" data-testid="audit-entry-count">
          {entries.length} entrée{entries.length > 1 ? 's' : ''} affichée
          {entries.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            data-testid="audit-toggle-filters"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtres
          </button>
          <a
            href={csvHref}
            data-testid="audit-export-csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            data-testid="audit-refresh"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
      </div>

      {showFilters && (
        <form
          method="get"
          action="/admin/audit"
          className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-3"
          data-testid="audit-filters"
        >
          <input
            name="actor"
            defaultValue={filters.actor}
            placeholder="Acteur (email, nom, id)"
            className={inputCls}
          />
          <input
            name="capability"
            defaultValue={filters.capability}
            placeholder="Capacité exacte (admin.users.moderate)"
            className={inputCls}
          />
          <input
            name="action"
            defaultValue={filters.action}
            placeholder="Action (access.grant…)"
            className={inputCls}
          />
          <input
            name="target"
            defaultValue={filters.target}
            placeholder="Cible (identifiant, email)"
            className={inputCls}
          />
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Depuis
            <input type="date" name="since" defaultValue={filters.since} className={inputCls} />
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Jusqu&apos;à
            <input type="date" name="until" defaultValue={filters.until} className={inputCls} />
          </label>
          <div className="md:col-span-3 flex gap-2">
            <button
              type="submit"
              data-testid="audit-apply-filters"
              className="rounded-xl bg-[#EE4B2B] px-4 py-2 text-xs font-bold text-white"
            >
              Appliquer
            </button>
            <a
              href="/admin/audit"
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
            >
              Réinitialiser
            </a>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm" data-testid="audit-table">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quand</th>
                <th className="px-4 py-3">Qui</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Capacité</th>
                <th className="px-4 py-3">Cible</th>
                <th className="px-4 py-3">Motif &amp; diff</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Aucune entrée pour ces filtres.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const meta = actionMeta[entry.action];
                  const Icon = meta?.icon ?? ShieldCheck;
                  const before = compact(entry.before);
                  const after = compact(entry.after) || compact(entry.metadata);
                  return (
                    <tr key={entry.id} className="border-b border-border/60 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium">{entry.actorName ?? entry.actorEmail}</div>
                        <div className="text-muted-foreground">{entry.actorEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Icon className="h-3.5 w-3.5" /> {meta?.label ?? entry.action}
                        </span>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {entry.action}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {entry.capability ?? <span className="text-muted-foreground">—</span>}
                        {entry.proofLevel ? (
                          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px]">
                            {entry.proofLevel}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{entry.targetType}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {entry.targetId ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {entry.reason ? <div className="italic">« {entry.reason} »</div> : null}
                        {before || after ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {before ? <span className="line-through">{before}</span> : null}
                            {before && after ? <span> → </span> : null}
                            {after ? <span>{after}</span> : null}
                          </div>
                        ) : (
                          !entry.reason && <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
