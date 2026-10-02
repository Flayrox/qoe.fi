'use client';

// =====================================================================
// 🧾 Export signé du registre de consentement — avec step-up (Phase 3)
// =====================================================================
// Produire un export de conformité sort les données personnelles de TOUS les
// comptes : le garde exige, en plus de la capacité, une preuve forte récente
// (N2). Une session `aal2` ouverte le matin ne suffit donc pas — c'est le
// critère de sortie de la Phase 3.
//
// Le formulaire reste identique pour la personne (destinataire, motif,
// périmètre), mais il n'est plus un POST natif qui afficherait un JSON de refus :
// on envoie la requête, et si le refus demande une vérification, on la propose
// AVANT de la rejouer. Les champs saisis ne sont jamais perdus : ils vivent
// dans le composant, et l'envoi est implicitement relancé avec les mêmes
// valeurs.
//
// Le corps de la réponse n'est jamais re-sérialisé : la signature Ed25519 porte
// sur les octets exacts, donc on télécharge le flux tel quel.
// =====================================================================

import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { attemptWithStepUp, readMessage } from '@/lib/authz-feedback';

interface ExportOutcome {
  ok: boolean;
  error?: string;
  code?: string;
  blob?: Blob;
  filename?: string;
}

/** Un refus lisible : code d'autorisation transporté pour le step-up. */
async function readFailure(response: Response): Promise<ExportOutcome> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    level?: string;
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
  return match?.[1] ?? 'qoe-consentements.json';
}

export function ExportForm({ documents }: { documents: { slug: string; title?: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sending, setSending] = useState(false);

  async function send(): Promise<ExportOutcome> {
    const form = formRef.current;
    if (!form) return { ok: false, error: 'Formulaire indisponible' };
    const response = await fetch('/admin/compliance/export', {
      method: 'POST',
      body: new FormData(form),
    });
    if (!response.ok) return readFailure(response);
    return { ok: true, blob: await response.blob(), filename: filenameFrom(response) };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      // Rejeu automatique après vérification d'un facteur fort : la même
      // fonction, donc les mêmes champs — aucune saisie à refaire.
      const res = await attemptWithStepUp(send, {
        reason: 'Produire un export signé du registre exige une preuve forte récente.',
      });
      if (!res.ok || !res.blob) {
        toast.error(readMessage(res) ?? res.error ?? 'Export impossible');
        return;
      }
      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename ?? 'qoe-consentements.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Export signé téléchargé.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export impossible');
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      data-testid="compliance-export-form"
      className="grid gap-3 border-b border-border px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="text-[11px] font-semibold text-muted-foreground">
        Destinataire / contexte
        <input
          name="subject"
          maxLength={200}
          placeholder="CNIL — contrôle du 12/09"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-normal text-foreground"
        />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        Motif
        <input
          name="reason"
          maxLength={500}
          placeholder="Demande de pièces"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-normal text-foreground"
        />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        Document (optionnel)
        <select
          name="slug"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-normal text-foreground"
        >
          <option value="">Tous les documents</option>
          {documents.map((doc) => (
            <option key={doc.slug} value={doc.slug}>
              {doc.title || doc.slug}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        Depuis (optionnel)
        <input
          type="date"
          name="from"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-normal text-foreground"
        />
      </label>
      <div className="sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={sending}
          data-testid="compliance-export-submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Produire et télécharger l’export signé
        </button>
        <span className="ml-3 text-[11px] text-muted-foreground">
          Authentification forte récente requise : la pièce contient des données personnelles —
          signée, tracée, et à ne pas diffuser plus largement que nécessaire.
        </span>
      </div>
    </form>
  );
}
