// =====================================================================
// 👥 File de revue des imports d'abonnés — lots en quarantaine
// =====================================================================
// Lots ouverts (submitted, reviewing, needs_info), plus anciens d'abord.
// Chaque lot mène à son dossier : provenance, bilan, décisions, vagues.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { getImportQueue } from '@/lib/admin-data';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'À examiner',
  reviewing: 'En examen',
  needs_info: 'Complément demandé',
};

export default async function AdminImportsPage() {
  const data = await getImportQueue();
  const batches = data.batches ?? [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <Inbox className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Imports d'abonnés</h1>
          {batches.length > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {batches.length} en file
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les listes déposées restent en quarantaine : aucun contact n'est créé, aucun email n'est
          envoyé tant que le staff n'a pas statué. Importer n'est pas envoyer.
        </p>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucun lot en attente de revue. La file est vide.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/admin/imports/${encodeURIComponent(b.id)}`}
              className="block rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-muted-foreground">{b.id}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">{b.rowCount} adresses</span>
                    <span className="text-muted-foreground"> · {b.source}</span>
                    <span className="text-muted-foreground"> · v{b.fileVersion}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border/60 px-2.5 py-1 text-xs font-semibold">
                  {STATUS_LABELS[b.status] ?? b.status}
                </span>
              </div>
              {b.decision && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Dernière décision : <span className="font-semibold">{b.decision}</span>
                  {b.publicReason ? ` — ${b.publicReason}` : ''}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
