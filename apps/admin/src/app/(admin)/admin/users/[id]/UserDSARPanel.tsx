'use client';

// =====================================================================
// 🛡️ UserDSARPanel — console RGPD / DSAR sur la fiche utilisateur
// =====================================================================
// Déclenche l'exportation du dossier complet (Art. 15 / 20) ou l'effacement
// définitif (Art. 17) avec motif obligatoire, step-up N2 et audit scellé.
// =====================================================================

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, ShieldAlert, Trash2, UserX, CheckCircle2 } from 'lucide-react';
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
import type { ErasureReceipt } from '@/lib/admin-data';
import { eraseUserAction } from '@/lib/admin-compliance-actions';
import {
  attemptWithStepUp,
  isFailure,
  notifyActionFailure,
  readMessage,
} from '@/lib/authz-feedback';

export function UserDSARPanel({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<ErasureReceipt | null>(null);
  const [pending, startTransition] = React.useTransition();

  const handleEraseConfirm = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

    startTransition(async () => {
      const result = await attemptWithStepUp(() => eraseUserAction(userId, trimmedReason));

      if (isFailure(result) || !('receipt' in result)) {
        notifyActionFailure(result, readMessage(result) ?? 'Effacement impossible');
        return;
      }

      setReceipt(result.receipt);
      setStatus(`Compte effacé · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      setIsModalOpen(false);
      setReason('');
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-border/80 bg-card p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Conformité &amp; RGPD (DSAR &amp; Art. 17)
          </h2>
        </div>
        {status && (
          <span className="rounded border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success-text">
            {status}
          </span>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Gestion des droits des personnes concernées. L’export produit une archive JSON complète
        horodatée et scellée (SHA-256). L’effacement purge l’ensemble des données personnelles,
        ajoute l’adresse au registre d’exclusion email et consigne une preuve cryptographique
        d’effacement dans l’audit.
      </p>

      {receipt ? (
        <div className="rounded border border-success/30 bg-success/5 p-4 text-[12px] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-success-text">
            <CheckCircle2 className="h-4 w-4" /> Compte effacé avec succès (Preuve scellée)
          </div>
          <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground">
            <div>
              <span className="text-foreground">Reçu :</span>{' '}
              <span className="tabular-nums">{receipt.receiptId}</span>
            </div>
            <div>
              <span className="text-foreground">Horodatage :</span>{' '}
              <span className="tabular-nums">{receipt.erasedAt}</span>
            </div>
            <div>
              <span className="text-foreground">Empreinte preuve (SHA-256) :</span>{' '}
              <span className="tabular-nums break-all">{receipt.proofSha256}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <form action={`/admin/users/${userId}/dsar`} method="POST" target="_blank">
            <Button type="submit" variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Exporter le dossier (DSAR)
            </Button>
          </form>

          <Button tone="danger" size="sm" className="gap-1.5" onClick={() => setIsModalOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Purger le compte (Art. 17)
          </Button>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsModalOpen(false);
            setReason('');
          }
        }}
        size="md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive-text">
              <ShieldAlert className="h-5 w-5" /> Confirmation d’effacement définitif
            </DialogTitle>
            <DialogDescription>
              Cette opération est <strong>irréversible</strong>. L’utilisateur{' '}
              <span className="font-semibold text-foreground">{userEmail}</span> sera définitivement
              supprimé.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="rounded border border-destructive/20 bg-destructive/10 p-3 text-[11px] leading-relaxed text-destructive-text">
              <p className="font-semibold">Conséquences de l’acte :</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Suppression définitive du compte, profil et métadonnées.</li>
                <li>Suppression des articles, commentaires et signets.</li>
                <li>Suppression de la publication personnelle associée.</li>
                <li>Consignation permanente de l’empreinte de preuve dans l’audit.</li>
              </ul>
            </div>

            <div>
              <label
                htmlFor="user-erasure-reason"
                className="block text-[11px] font-medium text-foreground mb-1"
              >
                Motif légal d’effacement (obligatoire pour audit)
              </label>
              <Textarea
                id="user-erasure-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex. Demande formelle de droit à l'oubli Art. 17 RGPD reçue par courriel..."
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
                setIsModalOpen(false);
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
    </div>
  );
}
