'use client';

// =====================================================================
// 👥 Dossier d'un lot d'import — revue staff complète
// =====================================================================
// Un seul écran pour : le bilan de quarantaine, la provenance déclarée, les
// signaux de risque, l'historique des décisions (motifs internes inclus — vue
// staff uniquement), la décision à prendre, et les vagues (reconfirmation et
// envoi encadré) avec leurs actions.
//
// Règles produit rappelées dans l'UI : une décision porte sur la version
// exacte du fichier (version + empreinte pré-remplies, modifiables pour
// refuser explicitement une version) ; approuver n'active personne — seule la
// reconfirmation (clic individuel) ou l'envoi encadré (budget, suspension
// auto) fait suite, jamais une activation directe.
// =====================================================================

import React, { useState } from 'react';
import { toast } from '@qoe/ui/toast';
import { Select } from '@qoe/ui/select';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Badge } from '@qoe/ui/badge';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@qoe/ui/table';
import { Loader2 } from 'lucide-react';
import {
  cancelSendWaveAction,
  claimImportAction,
  decideImportAction,
  purgeReconfirmAction,
  startReconfirmWaveAction,
  startSendWaveAction,
} from '@qoe/sdk/actions/admin';
import type { ImportReview } from '@/lib/admin-data';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';

const DECISION_LABELS: Record<string, string> = {
  needs_info: 'Complément demandé',
  rejected: 'Refusé',
  approved_reconfirm: 'Accepté avec reconfirmation',
  approved_direct: 'Accepté pour envoi encadré',
  suspended: 'Suspendu',
  resumed: 'Reprise',
  cancelled: 'Annulé',
};

const ROW_STATUS_LABELS: Record<string, string> = {
  invalid: 'Invalide',
  duplicate: 'Doublon',
  suppressed: 'En opposition',
  already_subscribed: 'Déjà abonné',
  pending_confirmation: 'En attente',
  eligible_direct: 'Éligible direct',
  excluded: 'Exclu',
  active: 'Actif',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-5 space-y-4">
      <h2 className="font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

export function ImportReviewClient({ initial }: { initial: ImportReview }) {
  const [busy, setBusy] = useState<string | null>(null);

  // Formulaire de décision : version + empreinte pré-remplies depuis le lot
  // courant — le staff les change explicitement s'il statue sur une version
  // qui n'est plus la courante (le backend refuse les versions périmées).
  const [decision, setDecision] = useState('needs_info');
  const [internalReason, setInternalReason] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [fileVersion, setFileVersion] = useState(String(initial.batch.fileVersion ?? 1));
  const [fileFingerprint, setFileFingerprint] = useState(initial.batch.fileFingerprint ?? '');
  const [maxRecipients, setMaxRecipients] = useState('');
  const [maxWave, setMaxWave] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [excludeEmails, setExcludeEmails] = useState('');

  const [waveSize, setWaveSize] = useState('500');
  const [sendCap, setSendCap] = useState('');

  // Les décisions sur un lot d'import — juger l'origine d'un fichier d'abonnés,
  // ouvrir une vague d'envoi encadré, purger — exigent une preuve forte récente
  // (N2). Un refus de ce type ouvre la vérification de facteur, puis l'action
  // est REJOUÉE telle quelle : la décision en cours de rédaction n'est pas
  // perdue, et rien n'est décidé deux fois.
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: unknown }>) => {
    setBusy(key);
    try {
      const res = await attemptWithStepUp(fn);
      if (!res.ok) {
        notifyActionFailure(res, readMessage(res) ?? 'Action impossible');
      } else {
        toast.success('Action enregistrée');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Action impossible');
    } finally {
      setBusy(null);
    }
  };

  const batch = initial.batch;
  const stats = initial.stats ?? {};
  const rowCounts = initial.rowCounts ?? {};

  const submitDecision = () =>
    run('decide', () => {
      const limits: Record<string, unknown> = {};
      if (maxRecipients.trim()) limits.maxRecipients = Number(maxRecipients);
      if (maxWave.trim()) limits.maxWave = Number(maxWave);
      return decideImportAction({
        batchId: batch.id,
        decision: decision as 'needs_info',
        internalReason: internalReason || undefined,
        publicReason: publicReason || undefined,
        fileVersion: Number(fileVersion) || 0,
        fileFingerprint: fileFingerprint || undefined,
        limits: Object.keys(limits).length ? limits : undefined,
        expiresAt: expiresAt || undefined,
        excludeEmails: excludeEmails
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      });
    });

  return (
    <div className="space-y-6 text-foreground font-sans">
      {/* ── Bilan ── */}
      <Section title="Bilan de quarantaine">
        <div className="grid gap-2 sm:grid-cols-2">
          <KV label="Statut" value={batch.status} />
          <KV label="Source" value={batch.source} />
          <KV label="Adresses reçues" value={batch.rowCount} />
          <KV
            label="Version du fichier"
            value={
              <span className="tabular-nums text-xs">
                v{batch.fileVersion} · {batch.fileFingerprint?.slice(0, 12) ?? '—'}…
              </span>
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(rowCounts).map(([status, n]) => (
            <Badge key={status} variant="soft" tone="neutral" size="sm">
              {ROW_STATUS_LABELS[status] ?? status} : <strong className="ml-1">{n}</strong>
            </Badge>
          ))}
          {Object.keys(rowCounts).length === 0 && (
            <span className="text-xs text-muted-foreground">
              Reçues : {stats.received ?? '—'} · valides : {stats.valid ?? '—'} · doublons :{' '}
              {stats.duplicates ?? '—'} · invalides : {stats.invalid ?? '—'}
            </span>
          )}
        </div>
        {initial.rows.length > 0 && (
          <Table aria-label="Échantillon d'adresses neutralisé" size="sm">
            <TableHeader>
              <TableColumn isRowHeader>Adresse (échantillon neutralisé)</TableColumn>
              <TableColumn>Verdict</TableColumn>
              <TableColumn>Motif</TableColumn>
            </TableHeader>
            <TableBody
              items={initial.rows
                .slice(0, 50)
                .map((row, i) => ({ ...row, id: `${row.email}-${i}` }))}
            >
              {(row) => (
                <TableRow id={row.id}>
                  <TableCell className="tabular-nums">{row.email}</TableCell>
                  <TableCell>{ROW_STATUS_LABELS[row.status] ?? row.status}</TableCell>
                  <TableCell className="text-muted-foreground">{row.reason ?? '—'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* ── Provenance + signaux ── */}
      <Section title="Provenance déclarée et signaux">
        <div className="grid gap-2 sm:grid-cols-2">
          <KV label="Détail source" value={initial.sourceDetail || '—'} />
          <KV label="Méthode d'opt-in alléguée" value={initial.optInMethod || '—'} />
          <KV
            label="Déclarations"
            value={
              <span className="tabular-nums text-xs">
                {JSON.stringify(initial.declarations ?? {})}
              </span>
            }
          />
          <KV
            label="Preuves"
            value={
              initial.proofRefs.length ? `${initial.proofRefs.length} pièce(s) jointe(s)` : 'aucune'
            }
          />
        </div>
        <pre className="overflow-x-auto rounded-xl bg-muted/40 p-3 tabular-nums text-[11px] leading-relaxed text-muted-foreground">
          {JSON.stringify(initial.signals ?? {}, null, 2)}
        </pre>
      </Section>

      {/* ── Décisions ── */}
      <Section title="Décisions">
        {initial.decisions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune décision enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {initial.decisions.map((d) => (
              <div key={d.id} className="rounded-xl border border-border/40 p-3 text-xs space-y-1">
                <p>
                  <strong>{DECISION_LABELS[d.decision] ?? d.decision}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    · {d.actorKind} · v{d.fileVersion} · {d.createdAt}
                  </span>
                </p>
                {d.publicReason && (
                  <p>
                    <span className="text-muted-foreground">Communicable : </span>
                    {d.publicReason}
                  </p>
                )}
                {d.internalReason && (
                  <p>
                    <span className="text-muted-foreground">Interne : </span>
                    {d.internalReason}
                  </p>
                )}
                {d.expiresAt && <p className="text-muted-foreground">Expire le : {d.expiresAt}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-border/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nouvelle décision
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Décision</span>
              <Select
                label="Décision"
                hideLabel
                value={decision}
                onValueChange={setDecision}
                options={[
                  { id: 'needs_info', label: 'Complément demandé (aucun envoi)' },
                  { id: 'rejected', label: 'Refusé (aucun envoi)' },
                  { id: 'approved_reconfirm', label: 'Accepté avec reconfirmation' },
                  { id: 'approved_direct', label: 'Accepté pour envoi encadré' },
                  { id: 'suspended', label: 'Suspendu' },
                  { id: 'resumed', label: 'Reprise' },
                  { id: 'cancelled', label: 'Annulé' },
                ]}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Expire le (optionnel)</span>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                size="sm"
              />
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-muted-foreground">
                Motif interne (jamais exposé au demandeur)
              </span>
              <Textarea
                value={internalReason}
                onChange={(e) => setInternalReason(e.target.value)}
                rows={2}
                size="sm"
              />
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Motif communicable</span>
              <Textarea
                value={publicReason}
                onChange={(e) => setPublicReason(e.target.value)}
                rows={2}
                size="sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Version du fichier visée</span>
              <Input
                value={fileVersion}
                onChange={(e) => setFileVersion(e.target.value)}
                inputMode="numeric"
                size="sm"
                className="tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Empreinte visée</span>
              <Input
                value={fileFingerprint}
                onChange={(e) => setFileFingerprint(e.target.value)}
                size="sm"
                className="tabular-nums"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Plafond destinataires (envoi encadré)</span>
              <Input
                value={maxRecipients}
                onChange={(e) => setMaxRecipients(e.target.value)}
                inputMode="numeric"
                placeholder="défaut 1000"
                size="sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Plafond par vague (reconfirmation)</span>
              <Input
                value={maxWave}
                onChange={(e) => setMaxWave(e.target.value)}
                inputMode="numeric"
                placeholder="défaut 500"
                size="sm"
              />
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-muted-foreground">
                Exclure des adresses (une par ligne ou séparées par virgules — deviennent une
                opposition durable)
              </span>
              <Textarea
                value={excludeEmails}
                onChange={(e) => setExcludeEmails(e.target.value)}
                rows={2}
                size="sm"
                className="tabular-nums"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => run('claim', () => claimImportAction(batch.id))}
            >
              {busy === 'claim' ? '…' : 'Marquer en examen'}
            </Button>
            <Button
              type="button"
              variant="solid"
              tone="brand"
              size="sm"
              disabled={busy !== null}
              onClick={submitDecision}
            >
              {busy === 'decide' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy === 'decide' ? 'Enregistrement…' : 'Enregistrer la décision'}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Une décision est immuable et porte sur la version exacte du fichier : modifier le CSV
            après approbation réexamine le lot au lieu d'hériter de l'accord. Approuver n'active
            personne — seule la reconfirmation (clic) ou l'envoi encadré (budget, suspension auto)
            fait suite.
          </p>
        </div>
      </Section>

      {/* ── Vagues de reconfirmation ── */}
      <Section title="Reconfirmation individuelle">
        {initial.reconfirmWaves.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune vague ouverte.</p>
        ) : (
          <div className="space-y-2">
            {initial.reconfirmWaves.map((w) => (
              <div key={w.id} className="rounded-xl border border-border/40 p-3 text-xs">
                <p>
                  <strong>{w.status}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    · taille {w.waveSize} · envoyés {w.sentCount} · confirmés {w.confirmedCount} ·
                    expirés {w.expiredCount} · ignorés {w.skippedCount}
                  </span>
                </p>
                <p className="mt-1 tabular-nums text-[11px] text-muted-foreground">{w.id}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Taille de vague</span>
            <Input
              value={waveSize}
              onChange={(e) => setWaveSize(e.target.value)}
              inputMode="numeric"
              size="sm"
              className="w-28"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run('reconfirm', () =>
                startReconfirmWaveAction({ batchId: batch.id, waveSize: Number(waveSize) || 0 })
              )
            }
          >
            {busy === 'reconfirm' ? '…' : 'Ouvrir une vague'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run('purge', () => purgeReconfirmAction(batch.id))}
          >
            {busy === 'purge' ? '…' : 'Purger les demandes échues'}
          </Button>
        </div>
      </Section>

      {/* ── Vagues d'envoi encadré ── */}
      <Section title="Envoi encadré">
        {initial.sendWaves.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune vague d'envoi ouverte.</p>
        ) : (
          <div className="space-y-2">
            {initial.sendWaves.map((w) => (
              <div key={w.id} className="rounded-xl border border-border/40 p-3 text-xs">
                <p>
                  <strong>{w.status}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    · budget {w.budgetConsumed}/{w.budgetCap} · envoyés {w.sentCount} · échecs{' '}
                    {w.failedCount} · rejets durs {w.hardBounceCount} · plaintes {w.complaintCount}{' '}
                    · désinscriptions {w.unsubscribeCount} · ignorés {w.skippedCount}
                  </span>
                </p>
                <p className="mt-1 tabular-nums text-[11px] text-muted-foreground">{w.id}</p>
                {(w.status === 'queued' || w.status === 'sending' || w.status === 'paused') && (
                  <Button
                    type="button"
                    variant="soft"
                    tone="danger"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`cancel-${w.id}`, () =>
                        cancelSendWaveAction({ batchId: batch.id, waveId: w.id })
                      )
                    }
                    className="mt-2"
                  >
                    {busy === `cancel-${w.id}` ? '…' : 'Annuler la vague'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Plafond destinataires</span>
            <Input
              value={sendCap}
              onChange={(e) => setSendCap(e.target.value)}
              inputMode="numeric"
              placeholder="défaut 1000"
              size="sm"
              className="w-36"
            />
          </label>
          <Button
            type="button"
            variant="solid"
            tone="brand"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run('sendwave', () =>
                startSendWaveAction({ batchId: batch.id, cap: Number(sendCap) || 0 })
              )
            }
          >
            {busy === 'sendwave' ? '…' : "Ouvrir une vague d'envoi"}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Réservé aux lots <span className="tabular-nums">approved_direct</span> avec preuves
          solides. Le budget est atomique (aucun dépassement même en concurrence), chaque envoi
          revérifie opposition et suspension, et la vague se suspend seule sur seuils (rejets durs,
          plaintes).
        </p>
      </Section>

      {/* ── Journal ── */}
      <Section title="Journal du lot">
        {initial.events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun événement.</p>
        ) : (
          <div className="space-y-1.5">
            {initial.events.map((e, i) => (
              <p key={i} className="tabular-nums text-[11px] text-muted-foreground">
                {e.createdAt} · {e.actorKind} · {e.type}
              </p>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
