import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileCheck2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type {
  AdminLegalReview,
  ConsentExportRecord,
  ConsentExportVerification,
} from '@/lib/admin-data';
import { dismissLegalReviewAction, runLegalLifecycleAction } from '@/lib/admin-legal-actions';

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string) {
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

const REVIEW_STATUS: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Ouverte', className: 'text-highlight bg-highlight/10' },
  DRAFTED: { label: 'Brouillon prêt', className: 'text-primary bg-primary/10' },
  PUBLISHED: { label: 'Faite', className: 'text-success bg-success/10' },
  DISMISSED: { label: 'Close sans publication', className: 'text-muted-foreground bg-muted' },
};

/** Les revues qu'il reste à traiter, puis l'historique récent. */
function sortReviews(reviews: AdminLegalReview[]) {
  const weight: Record<string, number> = { OPEN: 0, DRAFTED: 1, DISMISSED: 3, PUBLISHED: 2 };
  return [...reviews].sort((a, b) => (weight[a.status] ?? 9) - (weight[b.status] ?? 9));
}

export function ComplianceLifecycle({
  reviews,
  exports: exportRecords,
  verification,
  documents,
}: {
  reviews: AdminLegalReview[];
  exports: ConsentExportRecord[];
  verification: ConsentExportVerification | null;
  documents: { slug: string; title: string }[];
}) {
  const activeReviews = sortReviews(reviews).filter(
    (review) => review.status === 'OPEN' || review.status === 'DRAFTED'
  );
  const otherReviews = sortReviews(reviews).filter(
    (review) => review.status !== 'OPEN' && review.status !== 'DRAFTED'
  );

  return (
    <div className="space-y-8">
      {/* ─── Revues périodiques ─── */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Cycle de vie — revues et publications planifiées
          </h2>
          <form action={runLegalLifecycleAction} className="ml-auto">
            <button
              type="submit"
              className="rounded-xl border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Lancer le cycle maintenant
            </button>
          </form>
        </header>

        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Chaque échéance réglementaire ouvre une revue qui arrive{' '}
            <strong>déjà avec un brouillon</strong> reprenant le texte publié : relire coûte moins
            cher que repartir d&apos;une page blanche. Publier ce brouillon — manuellement ou à la
            fenêtre planifiée — clôt la revue et remet le compteur à zéro. Trois rappels email
            maximum par revue, aux paliers
            <em> bientôt</em>, <em>brouillon prêt</em> et <em>en retard</em>.
          </p>
        </div>

        <ul className="divide-y divide-border">
          {activeReviews.map((review) => {
            const style = REVIEW_STATUS[review.status] ?? REVIEW_STATUS.OPEN;
            return (
              <li key={review.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {review.documentSlug}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
                      >
                        {style.label}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{review.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {review.legal}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Échéance {formatDate(review.dueAt)} ·{' '}
                      {review.daysLeft < 0
                        ? `${Math.abs(review.daysLeft)} j de retard`
                        : `dans ${review.daysLeft} j`}
                      {review.draftVersion ? (
                        <>
                          {' '}
                          · brouillon <span className="text-foreground">{review.draftVersion}</span>
                        </>
                      ) : null}
                      {review.reminders > 0 ? (
                        <>
                          {' '}
                          · {review.remindersSent}/{review.reminders} rappel(s) envoyé(s)
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link
                      href="/admin/legal"
                      className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                    >
                      Ouvrir l&apos;éditeur
                    </Link>
                    <form action={dismissLegalReviewAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input
                        name="notes"
                        required
                        placeholder="Motif de clôture"
                        className="w-[180px] rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Clore
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
          {activeReviews.length === 0 && (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              Aucune revue ouverte : toutes les échéances sont à jour.
            </li>
          )}
        </ul>

        {otherReviews.length > 0 && (
          <details className="border-t border-border px-5 py-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
              Historique des revues closes ({otherReviews.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {otherReviews.map((review) => (
                <li key={review.id} className="text-[11px] text-muted-foreground">
                  <span className="text-foreground">{review.documentSlug}</span> ·{' '}
                  {REVIEW_STATUS[review.status]?.label ?? review.status} le{' '}
                  {formatDate(review.completedAt)} · échéance {formatDate(review.dueAt)}
                  {review.notes ? ` · ${review.notes}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ─── Registre des exports signés ─── */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <FileCheck2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Registre des consentements — exports signés
          </h2>
          {verification && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                verification.broken.length === 0
                  ? 'text-success bg-success/10'
                  : 'text-destructive bg-destructive/10'
              }`}
            >
              {verification.broken.length === 0 ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <ShieldAlert className="h-3 w-3" />
              )}
              Chaîne {verification.valid}/{verification.total} vérifiée
            </span>
          )}
        </header>

        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Une réponse à une demande de contrôle ou à une réquisition doit être opposable. Chaque
            export est <strong>signé en Ed25519</strong> — la clé publique voyage dans la pièce,
            donc l&apos;autorité peut vérifier sans rien nous demander —, <strong>chaîné</strong> au
            précédent (retirer une pièce casse la chaîne) et <strong>horodaté</strong> dans le
            message signé. Le motif et le périmètre sont consignés : un export dit pourquoi il a été
            produit.
          </p>
          {verification?.keyId && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <KeyRound className="h-3 w-3" /> Clé de signature :{' '}
              <code className="font-semibold text-foreground">{verification.keyId}</code>
            </p>
          )}
          {verification && verification.broken.length > 0 && (
            <ul className="mt-2 space-y-1">
              {verification.broken.map((item) => (
                <li
                  key={item.exportId}
                  className="inline-flex items-center gap-1.5 text-[11px] text-destructive"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Export #{item.seq} : {item.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          action="/admin/compliance/export"
          method="post"
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" />
              Produire et télécharger l&apos;export signé
            </button>
            <span className="ml-3 text-[11px] text-muted-foreground">
              La pièce contient des données personnelles : elle est signée, tracée, et ne doit pas
              être diffusée plus largement que nécessaire.
            </span>
          </div>
        </form>

        <ul className="divide-y divide-border">
          {exportRecords.map((record) => (
            <li key={record.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                #{record.seq}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {record.subject || 'Export du registre'}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {record.scope}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDateTime(record.generatedAt)} · par{' '}
                  {record.requestedByEmail || 'compte supprimé'} · {record.acceptancesCount}{' '}
                  acceptation(s) · {record.cookieRecordsCount} choix traceurs ·{' '}
                  {record.documentsCount} document(s)
                </p>
                <code className="mt-1 block truncate text-[10px] text-muted-foreground">
                  {record.chainSha256}
                </code>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  verification
                    ? verification.broken.some((b) => b.exportId === record.id)
                      ? 'text-destructive bg-destructive/10'
                      : 'text-success bg-success/10'
                    : 'text-muted-foreground bg-muted'
                }`}
              >
                <CalendarClock className="h-3 w-3" />
                {record.algorithm}
              </span>
            </li>
          ))}
          {exportRecords.length === 0 && (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              Aucun export produit pour l&apos;instant. Le registre se remplit à la première
              demande.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
