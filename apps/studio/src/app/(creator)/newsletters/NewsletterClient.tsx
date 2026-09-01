'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import {
  Mail,
  Plus,
  Send,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  Eye,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import {
  createNewsletterAction,
  deleteNewsletterAction,
  listNewslettersAction,
  sendNewsletterAction,
  updateNewsletterAction,
  type NewsletterIssue,
} from './actions';

interface NewsletterClientProps {
  initialIssues: NewsletterIssue[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
  SENDING: { label: 'En cours d’envoi…', cls: 'bg-primary/10 text-primary animate-pulse' },
  SENT: { label: 'Envoyée', cls: 'bg-success/10 text-success' },
  FAILED: { label: 'Échec', cls: 'bg-destructive/10 text-destructive' },
};

export function NewsletterClient({ initialIssues }: NewsletterClientProps) {
  const [issues, setIssues] = useState<NewsletterIssue[]>(initialIssues);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<NewsletterIssue | null>(null);
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [html, setHtml] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await listNewslettersAction();
    if (res.success) setIssues(res.items);
  };

  const openNew = () => {
    setEditing(null);
    setSubject('');
    setPreviewText('');
    setHtml('');
    setPreview(false);
    setShowEditor(true);
  };

  const openEdit = (issue: NewsletterIssue) => {
    setEditing(issue);
    setSubject(issue.subject);
    setPreviewText(issue.previewText ?? '');
    setHtml(issue.html);
    setPreview(false);
    setShowEditor(true);
  };

  const save = async () => {
    setBusy(true);
    const res = editing
      ? await updateNewsletterAction(editing.id, { subject, previewText, html })
      : await createNewsletterAction({ subject, previewText, html });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error || 'Erreur lors de la sauvegarde');
      return;
    }
    toast.success(editing ? 'Brouillon mis à jour' : 'Brouillon créé');
    setShowEditor(false);
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce brouillon ?')) return;
    setBusyId(id);
    const res = await deleteNewsletterAction(id);
    setBusyId(null);
    if (res.success) {
      toast.success('Brouillon supprimé');
      await refresh();
    } else {
      toast.error(res.error || 'Suppression impossible');
    }
  };

  const send = async (issue: NewsletterIssue) => {
    if (
      !confirm(
        `Envoyer « ${issue.subject} » à tous vos abonnés (receiveArticles) ? Cette action est définitive.`
      )
    )
      return;
    setBusyId(issue.id);
    const res = await sendNewsletterAction(issue.id);
    setBusyId(null);
    if (res.success) {
      toast.success(t`Envoi lancé — les abonnés recevront l'email sous quelques minutes.`);
      await refresh();
    } else {
      toast.error(res.error || 'Envoi impossible');
    }
  };

  const sentTotal = issues
    .filter((i) => i.status === 'SENT')
    .reduce((acc, i) => acc + i.totalRecipients, 0);

  return (
    <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/30">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Mail className="h-4 w-4 text-primary stroke-[1.5]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Email marketing
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Newsletters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envoyez un email à vos abonnés et suivez les statistiques d'envoi
          </p>
        </div>

        {!showEditor && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all self-start sm:self-auto shadow-sm"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
            <span>Nouvelle newsletter</span>
          </button>
        )}
      </div>

      {/* ─── KPI ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/30 bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Newsletters créées
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Mail className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{issues.length}</div>
          <p className="text-xs text-muted-foreground mt-2">
            {issues.filter((i) => i.status === 'DRAFT').length} brouillons en attente
          </p>
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Emails envoyés
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <Send className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">
            {sentTotal.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Cumul des newsletters envoyées</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Audience cible
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">—</div>
          <p className="text-xs text-muted-foreground mt-2">Voir la page Audience</p>
        </div>
      </div>

      {/* ─── Éditeur ────────────────────────────────────────────── */}
      {showEditor && (
        <div className="rounded-xl border border-border/30 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              {editing ? 'Modifier le brouillon' : 'Nouvelle newsletter'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreview(!preview)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye className="h-3.5 w-3.5 stroke-[1.5]" />
                {preview ? 'Éditer' : 'Prévisualiser'}
              </button>
              <button
                onClick={() => setShowEditor(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5 stroke-[1.5]" />
                Fermer
              </button>
            </div>
          </div>

          {preview ? (
            <div className="rounded-lg border border-border/30 overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30">
                Aperçu — {subject || 'Sans sujet'}
              </div>
              <div
                className="p-6 text-sm text-foreground [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sujet de l'email
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex. : Mon dernier article est en ligne !"
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border/30 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Texte d'aperçu (preheader)
                  </label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Résumé affiché sous le sujet dans la boîte de réception"
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border/30 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Contenu HTML
                </label>
                <textarea
                  rows={10}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  placeholder="<h1>Bonjour à tous…</h1><p>Le contenu de votre newsletter en HTML.</p>"
                  className="w-full px-3 py-2.5 bg-muted/40 border border-border/30 rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
                <p className="text-[11px] text-muted-foreground">
                  HTML simple (titres, paragraphes, images, liens). Enveloppé dans un gabarit qoe.fi
                  avec lien de désabonnement automatique.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={save}
                  disabled={busy || !subject.trim() || !html.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <Check className="h-3.5 w-3.5 stroke-[1.5]" />
                  {editing ? 'Enregistrer les modifications' : 'Créer le brouillon'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Liste des issues ───────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg border-border/30 bg-muted/10 m-6">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-foreground">Aucune newsletter</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Créez votre première newsletter pour communiquer avec vos abonnés.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {issues.map((issue) => {
              const meta = STATUS_META[issue.status] ?? STATUS_META.DRAFT;
              return (
                <div
                  key={issue.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm truncate">
                        {issue.subject}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(issue.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {issue.status !== 'DRAFT' &&
                        ` · ${issue.totalRecipients} destinataires · ${issue.sentCount} envoyés${
                          issue.failedCount > 0 ? ` · ${issue.failedCount} échecs` : ''
                        }`}
                    </p>
                    {issue.failedCount > 0 && (
                      <p className="flex items-center gap-1 text-[11px] text-destructive mt-1">
                        <AlertTriangle className="h-3 w-3" /> Certains emails n'ont pas pu être
                        envoyés — consultez les logs worker.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {busyId === issue.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <>
                        {issue.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => openEdit(issue)}
                              title="Modifier"
                              className="p-2 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5 stroke-[1.5]" />
                            </button>
                            <button
                              onClick={() => send(issue)}
                              title="Envoyer"
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all"
                            >
                              <Send className="h-3.5 w-3.5 stroke-[1.5]" />
                              Envoyer
                            </button>
                            <button
                              onClick={() => remove(issue.id)}
                              title="Supprimer"
                              className="p-2 rounded-lg border border-border/30 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
