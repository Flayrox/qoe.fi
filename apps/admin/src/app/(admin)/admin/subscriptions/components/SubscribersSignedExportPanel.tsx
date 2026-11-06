'use client';

// =====================================================================
// 📜 SubscribersSignedExportPanel — Registre des abonnés scellé Ed25519
// =====================================================================
// Permet de générer et télécharger un export signé et opposable du
// registre des abonnés, pour audit CNIL ou réquisition légale.
// Protégé par contrôle de capacité `admin.subscriptions.read` et step-up N2.
// =====================================================================

import { useState } from 'react';
import { Download, FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { attemptWithStepUp, readMessage } from '@/lib/authz-feedback';

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
  return match?.[1] ?? 'qoe-abonnes-signe.json';
}

export function SubscribersSignedExportPanel() {
  const [reason, setReason] = useState('Audit de conformité des abonnements');
  const [publicationId, setPublicationId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);

    try {
      const res = await attemptWithStepUp(
        async () => {
          const response = await fetch('/admin/subscriptions/signed-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: reason.trim() || 'Audit de conformité',
              publicationId: publicationId.trim() || undefined,
            }),
          });
          if (!response.ok) return readFailure(response);
          return { ok: true, blob: await response.blob(), filename: filenameFrom(response) };
        },
        { reason: 'L’export signé du registre des abonnés exige une preuve forte récente.' }
      );

      if (!res.ok || !res.blob) {
        setStatusMessage(readMessage(res) ?? res.error ?? 'Export refusé');
        return;
      }

      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename ?? 'qoe-abonnes-signe.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusMessage(
        `Audité · Registre des abonnés scellé Ed25519 à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erreur lors de l’export');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <FileCheck2 className="h-4 w-4" /> Registre signé des abonnés (Ed25519)
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Archive opposable contenant le statut d&apos;opt-in, la confirmation d&apos;email, les droits et
            l&apos;historique des abonnés, scellée par signature Ed25519 autonome vérifiable sans secret.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground space-y-1 block">
          Motif légal ou opérationnel
          <Input
            size="sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif de l’export (audit, contrôle régulateur…)"
          />
        </label>
        <label className="text-[11px] text-muted-foreground space-y-1 block">
          Filtrer par ID média (optionnel)
          <Input
            size="sm"
            value={publicationId}
            onChange={(e) => setPublicationId(e.target.value)}
            placeholder="Tous les médias si vide"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-xs text-muted-foreground">
          {statusMessage ? (
            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {statusMessage}
            </span>
          ) : (
            <span>Signature autonome incluant clé publique et empreinte SHA-256 canonique</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          className="gap-1.5"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Télécharger le registre signé
        </Button>
      </div>
    </section>
  );
}
