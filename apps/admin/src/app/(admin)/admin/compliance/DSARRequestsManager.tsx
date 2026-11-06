'use client';

// =====================================================================
// 🛡️ DSARRequestsManager — registre d'effacement & DSAR (Art. 15 / 17 RGPD)
// =====================================================================
// Décompte légal à 30 jours, téléchargement direct de l'archive personnelle
// signée (X-Qoe-DSAR-Hash), et purge définitive avec attestation scellée.
// =====================================================================

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  ShieldAlert,
  Trash2,
  UserX,
} from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Textarea } from '@qoe/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import type { RowActionItem } from '@/components/shell/RowMenu';
import type { DeletionRequestItem, ErasureReceipt } from '@/lib/admin-data';
import { eraseUserAction } from '@/lib/admin-compliance-actions';
import {
  attemptWithStepUp,
  isFailure,
  notifyActionFailure,
  readMessage,
} from '@/lib/authz-feedback';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DSARRequestsManager({ requests }: { requests: DeletionRequestItem[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Modale d'effacement irréversible
  const [selectedRequest, setSelectedRequest] = React.useState<DeletionRequestItem | null>(null);
  const [reason, setReason] = React.useState('');
  const [receipt, setReceipt] = React.useState<ErasureReceipt | null>(null);

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const urgentCount = requests.filter((r) => r.status === 'PENDING' && r.isUrgent).length;
  const processedCount = requests.filter((r) => r.status === 'PROCESSED').length;

  const handleEraseConfirm = () => {
    if (!selectedRequest) return;
    const req = selectedRequest;
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

    startTransition(async () => {
      const result = await attemptWithStepUp(() =>
        eraseUserAction(req.userId, trimmedReason, req.id)
      );

      if (isFailure(result) || !('receipt' in result)) {
        notifyActionFailure(result, readMessage(result) ?? 'Effacement impossible');
        return;
      }

      setReceipt(result.receipt);
      setStatus(`Effacement exécuté · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      setSelectedRequest(null);
      setReason('');
      router.refresh();
    });
  };

  const columns: GridColumn<DeletionRequestItem>[] = [
    {
      id: 'user',
      header: 'Utilisateur',
      sort: { kind: 'text', value: (r) => r.userEmail },
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{r.userName || r.userEmail}</span>
            {r.userName && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">{r.userEmail}</span>
            )}
          </div>
          <CopyableId id={r.userId} max={6} />
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      width: 110,
      sort: { kind: 'text', value: (r) => r.status },
      cell: (r) => {
        if (r.status === 'PROCESSED') {
          return (
            <span className="inline-flex items-center gap-1 rounded border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success-text">
              <CheckCircle2 className="h-3 w-3" /> Traité
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[10px] font-semibold text-highlight">
            <CalendarClock className="h-3 w-3" /> En attente
          </span>
        );
      },
    },
    {
      id: 'deadline',
      header: 'Délai légal (30 j)',
      width: 140,
      sort: { kind: 'number', value: (r) => (r.status === 'PROCESSED' ? 999 : r.daysRemaining) },
      cell: (r) => {
        if (r.status === 'PROCESSED') {
          return <span className="text-[11px] text-muted-foreground">Terminé</span>;
        }
        if (r.daysRemaining < 0) {
          return (
            <span className="inline-flex items-center gap-1 rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive-text tabular-nums">
              <AlertTriangle className="h-3 w-3" /> {Math.abs(r.daysRemaining)} j de retard
            </span>
          );
        }
        if (r.isUrgent) {
          return (
            <span className="inline-flex items-center gap-1 rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive-text tabular-nums">
              <AlertTriangle className="h-3 w-3" /> J-{r.daysRemaining} (Urgent)
            </span>
          );
        }
        return (
          <span className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground tabular-nums">
            J-{r.daysRemaining} restant(s)
          </span>
        );
      },
    },
    {
      id: 'requestedAt',
      header: 'Demandé le',
      width: 130,
      sort: { kind: 'text', value: (r) => r.requestedAt },
      cell: (r) => (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatDateTime(r.requestedAt)}
        </span>
      ),
    },
    {
      id: 'reason',
      header: 'Motif de l’utilisateur',
      cell: (r) => (
        <span className="line-clamp-1 text-[11px] text-muted-foreground" title={r.reason ?? ''}>
          {r.reason || 'Non spécifié'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      width: 190,
      align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <form action={`/admin/users/${r.userId}/dsar`} method="POST" target="_blank">
            <Button
              type="submit"
              variant="outline"
              size="xs"
              className="h-6 gap-1 px-2 text-[10px]"
              title="Exporter l'archive complète des données personnelles"
            >
              <Download className="h-3 w-3" /> DSAR
            </Button>
          </form>
          {r.status === 'PENDING' && (
            <Button
              tone="danger"
              size="xs"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => {
                setSelectedRequest(r);
                setReason(
                  r.reason
                    ? `Demande utilisateur : ${r.reason}`
                    : 'Demande d’effacement Art. 17 RGPD'
                );
              }}
            >
              <Trash2 className="h-3 w-3" /> Effacer
            </Button>
          )}
        </div>
      ),
    },
  ];

  const rowMenu = (r: DeletionRequestItem): RowActionItem[] => [
    {
      id: 'view-user',
      label: 'Voir la fiche utilisateur',
      onSelect: () => router.push(`/admin/users/${r.userId}`),
    },
    {
      id: 'copy-id',
      label: 'Copier l’ID utilisateur',
      shortcut: '⌘C',
      onSelect: () => void navigator.clipboard.writeText(r.userId),
    },
    ...(r.status === 'PENDING'
      ? [
          {
            id: 'erase',
            label: 'Exécuter l’effacement (Art. 17)',
            tone: 'danger' as const,
            onSelect: () => {
              setSelectedRequest(r);
              setReason(
                r.reason ? `Demande utilisateur : ${r.reason}` : 'Demande d’effacement Art. 17 RGPD'
              );
            },
          },
        ]
      : []),
  ];

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <UserX className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Demandes d’effacement RGPD & DSAR (Art. 12, 15, 17)
            </h2>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Délai légal de traitement : <strong>30 jours calendaires</strong> à compter de la
            réception. L’effacement purge les données personnelles, isole l’email dans le registre
            d’exclusion et consigne une preuve cryptographique scellée dans l’audit.
          </p>
        </div>

        {status && (
          <span className="rounded border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success-text">
            {status}
          </span>
        )}
      </div>

      {/* Métriques d'exploitation */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Demandes totales
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{requests.length}</p>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            En attente
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{pendingCount}</p>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Urgentes (&le; 7 jours)
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              urgentCount > 0 ? 'text-destructive-text' : 'text-foreground'
            }`}
          >
            {urgentCount}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Traitées
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-success-text">{processedCount}</p>
        </div>
      </div>

      {/* Attestation d'effacement récente */}
      {receipt && (
        <div className="rounded border border-success/30 bg-success/5 p-4 text-[12px] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-success-text">
            <CheckCircle2 className="h-4 w-4" /> Attestation d’effacement délivrée (Preuve scellée)
          </div>
          <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="text-foreground">Reçu :</span>{' '}
              <span className="tabular-nums">{receipt.receiptId}</span>
            </div>
            <div>
              <span className="text-foreground">Horodatage :</span>{' '}
              <span className="tabular-nums">{receipt.erasedAt}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-foreground">Empreinte preuve (SHA-256) :</span>{' '}
              <span className="tabular-nums break-all">{receipt.proofSha256}</span>
            </div>
          </div>
        </div>
      )}

      {/* Grille opérationnelle */}
      <DataGrid
        ariaLabel="Demandes d'effacement RGPD"
        rows={requests}
        columns={columns}
        rowMenu={rowMenu}
        density="compact"
        emptyState={
          <div className="py-8 text-center text-xs text-muted-foreground">
            Aucune demande d’effacement enregistrée.
          </div>
        }
      />

      {/* Modale de confirmation de purge irréversible */}
      <Dialog
        isOpen={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setReason('');
          }
        }}
        size="md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive-text">
              <ShieldAlert className="h-5 w-5" /> Confirmation d’effacement définitif (Art. 17)
            </DialogTitle>
            <DialogDescription>
              Cette opération est <strong>irréversible</strong>. L’utilisateur{' '}
              <span className="font-semibold text-foreground">{selectedRequest?.userEmail}</span>{' '}
              sera immédiatement et définitivement purgé.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="rounded border border-destructive/20 bg-destructive/10 p-3 text-[11px] leading-relaxed text-destructive-text">
              <p className="font-semibold">Conséquences de l’acte :</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Suppression du compte, profil, articles, commentaires et signets.</li>
                <li>Suppression de la publication personnelle associée.</li>
                <li>
                  Inscription de l’adresse dans le registre de suppression d’emails (blocage de tout
                  envoi futur).
                </li>
                <li>Scellement d’un reçu d’effacement avec empreinte cryptographique SHA-256.</li>
              </ul>
            </div>

            <div>
              <label
                htmlFor="dsar-erasure-reason"
                className="block text-[11px] font-medium text-foreground mb-1"
              >
                Motif légal d’effacement (obligatoire pour audit)
              </label>
              <Textarea
                id="dsar-erasure-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex. Demande formelle de l'utilisateur reçue par courriel le ..."
                rows={3}
                className="w-full text-xs"
              />
            </div>
          </DialogBody>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedRequest(null);
                setReason('');
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              tone="danger"
              size="sm"
              onClick={handleEraseConfirm}
              disabled={pending || !reason.trim()}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Confirmer la purge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
