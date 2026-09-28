// =====================================================================
// 👥 Dossier d'un lot d'import — provenance, bilan, décisions, vagues
// =====================================================================
// Vue staff complète (motifs internes inclus) : le demandeur ne voit que les
// motifs communicables via ses propres routes. Les adresses individuelles ne
// sont affichées que dans l'échantillon de revue (cellules neutralisées).
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getImportReview } from '@/lib/admin-data';
import { ImportReviewClient } from '../components/import-review-client';

export default async function AdminImportReviewPage({ params }: { params: { id: string } }) {
  let review;
  try {
    review = await getImportReview(params.id);
  } catch {
    notFound();
  }

  // Sérialisation explicite (comme les autres pages admin) : que du JSON pur
  // vers le composant client.
  const serialized = JSON.parse(
    JSON.stringify({
      batch: review.batch,
      declarations: review.declarations ?? {},
      proofRefs: review.proofRefs ?? [],
      sourceDetail: review.sourceDetail ?? '',
      optInMethod: review.optInMethod ?? '',
      stats: review.stats ?? {},
      rows: review.rows ?? [],
      rowCounts: review.rowCounts ?? {},
      decisions: review.decisions ?? [],
      events: review.events ?? [],
      signals: review.signals ?? {},
      reconfirmWaves: review.reconfirmWaves ?? [],
      sendWaves: review.sendWaves ?? [],
    })
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <Link
          href="/admin/imports"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour à la file
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Dossier d'import</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{review.batch.id}</p>
      </div>

      <ImportReviewClient initial={serialized} />
    </div>
  );
}
