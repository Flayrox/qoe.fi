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
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button, buttonClasses } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { attemptWithStepUp, readMessage } from '@/lib/authz-feedback';
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

interface ExportOutcome {
  ok: boolean;
  error?: string;
  code?: string;
  blob?: Blob;
  filename?: string;
}

async function readFailure(response: Response): Promise<ExportOutcome> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  return {
    ok: false,
    error: body.error ?? `Export indisponible (${response.status})`,
    code: body.code ?? response.headers.get('x-qoe-authz-code') ?? undefined,
  };
}

function filenameFrom(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return match?.[1] ?? 'qoe-audit-signe.json';
}

export function AuditLogClient({ entries, mode, filters }: AuditLogClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  const handleSignedExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const res = await attemptWithStepUp(
        async () => {
          const response = await fetch('/admin/audit/signed-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: 'Audit de sécurité administratif',
              action: filters.action || undefined,
              target: filters.target || undefined,
              since: filters.since || undefined,
              until: filters.until || undefined,
            }),
          });
          if (!response.ok) return readFailure(response);
          return { ok: true, blob: await response.blob(), filename: filenameFrom(response) };
        },
        { reason: 'Télécharger un registre d’audit signé Ed25519 exige une preuve forte récente.' }
      );

      if (!res.ok || !res.blob) {
        setStatusMessage(readMessage(res) ?? res.error ?? 'Export signé refusé');
        return;
      }

      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename ?? 'qoe-audit-signe.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusMessage(
        `Audité · Export signé Ed25519 scellé à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erreur lors de l’export');
    } finally {
      setIsExporting(false);
    }
  };

  // Le mode OBSERVATION est un fait d'exploitation : il reste affiché tant qu'il
  // dure, au-dessus des données qu'il nuance.
  const banner =
    mode === 'observe' ? (
      <div
        data-testid="audit-mode-banner"
        className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-3 text-xs text-foreground"
      >
        <strong>Mode OBSERVATION</strong> — les refus d’autorisation sont journalisés mais{' '}
        <strong>pas encore appliqués</strong>. Le passage en{' '}
        <span className="tabular-nums">enforce</span> se décide sur le volume de refus observés
        (journal des décisions).
      </div>
    ) : (
      <div
        data-testid="audit-mode-banner"
        className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-xs text-foreground"
      >
        <strong>Mode REFUS (enforce)</strong> — une capacité manquante répond 403. Les refus listés
        ci-dessous ont été réellement bloqués.
      </div>
    );

  return (
    <div className="space-y-4">
      {banner}

      {statusMessage && (
        <div
          role="status"
          className="rounded-lg border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-2"
        >
          <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" data-testid="audit-entry-count">
          {entries.length} entrée{entries.length > 1 ? 's' : ''} affichée
          {entries.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((open) => !open)}
            data-testid="audit-toggle-filters"
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtres
          </Button>
          <a
            href={csvHref}
            data-testid="audit-export-csv"
            className={buttonClasses({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignedExport}
            disabled={isExporting}
            data-testid="audit-export-signed"
            className="gap-1.5"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCheck2 className="h-3.5 w-3.5" />
            )}
            Export signé (Ed25519)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isPending}
            data-testid="audit-refresh"
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>
      </div>

      {showFilters && (
        <form
          method="get"
          action="/admin/audit"
          className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-3"
          data-testid="audit-filters"
        >
          <Input
            size="sm"
            name="actor"
            defaultValue={filters.actor}
            placeholder="Acteur (email, nom, id)"
          />
          <Input
            size="sm"
            name="capability"
            defaultValue={filters.capability}
            placeholder="Capacité exacte (admin.users.moderate)"
          />
          <Input
            size="sm"
            name="action"
            defaultValue={filters.action}
            placeholder="Action (access.grant…)"
          />
          <Input
            size="sm"
            name="target"
            defaultValue={filters.target}
            placeholder="Cible (identifiant, email)"
          />
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Depuis
            <Input size="sm" type="date" name="since" defaultValue={filters.since} />
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Jusqu&apos;à
            <Input size="sm" type="date" name="until" defaultValue={filters.until} />
          </label>
          <div className="md:col-span-3 flex gap-2">
            <Button
              type="submit"
              variant="solid"
              tone="brand"
              size="sm"
              data-testid="audit-apply-filters"
            >
              Appliquer
            </Button>
            <a href="/admin/audit" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
              Réinitialiser
            </a>
          </div>
        </form>
      )}

      <Table aria-label="Journal d'audit" size="md" data-testid="audit-table">
        <TableHeader>
          <TableColumn isRowHeader>Quand</TableColumn>
          <TableColumn>Qui</TableColumn>
          <TableColumn>Action</TableColumn>
          <TableColumn>Capacité</TableColumn>
          <TableColumn>Cible</TableColumn>
          <TableColumn>Motif &amp; diff</TableColumn>
        </TableHeader>
        <TableBody items={entries} emptyState="Aucune entrée pour ces filtres.">
          {(entry) => {
            const meta = actionMeta[entry.action];
            const Icon = meta?.icon ?? ShieldCheck;
            const before = compact(entry.before);
            const after = compact(entry.after) || compact(entry.metadata);
            return (
              <TableRow key={entry.id} id={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString('fr-FR')}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium text-foreground">
                    {entry.actorName ?? entry.actorEmail}
                  </div>
                  <div className="text-muted-foreground">{entry.actorEmail}</div>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5" /> {meta?.label ?? entry.action}
                  </span>
                  <div className="tabular-nums text-[10px] text-muted-foreground">
                    {entry.action}
                  </div>
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {entry.capability ?? <span className="text-muted-foreground">—</span>}
                  {entry.proofLevel ? (
                    <Badge variant="soft" tone="neutral" size="xs" className="ml-1 font-sans">
                      {entry.proofLevel}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="text-foreground">{entry.targetType}</div>
                  <div className="tabular-nums text-[10px] text-muted-foreground">
                    {entry.targetId ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {entry.reason ? (
                    <div className="italic text-foreground">« {entry.reason} »</div>
                  ) : null}
                  {before || after ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {before ? <span className="line-through">{before}</span> : null}
                      {before && after ? <span> → </span> : null}
                      {after ? <span className="text-foreground">{after}</span> : null}
                    </div>
                  ) : (
                    !entry.reason && <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          }}
        </TableBody>
      </Table>
    </div>
  );
}
