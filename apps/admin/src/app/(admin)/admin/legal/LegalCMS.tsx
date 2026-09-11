'use client';

// =====================================================================
// ⚖️ LegalCMS — édition du contenu juridique depuis la console admin
// =====================================================================
// Un document = un slug stable + N versions par locale. On édite des
// brouillons, on publie (l'ancienne passe ARCHIVED), on consulte les
// preuves de consentement. Rien n'est jamais modifié en place.
// =====================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markdownToHtml } from '@qoe/utils';
import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  ExternalLink,
  Filter,
  Globe,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { AdminLegalAcceptance, AdminLegalDocument, AdminLegalStats } from '@/lib/admin-data';
import {
  archiveLegalVersionAction,
  createLegalDocumentAction,
  createLegalVersionAction,
  deleteLegalDraftAction,
  deleteLegalDocumentAction,
  loadLegalVersionsAction,
  publishLegalVersionAction,
  seedLegalDefaultsAction,
  updateLegalDocumentAction,
  updateLegalVersionAction,
  type LegalVersionRow,
} from '@/lib/admin-legal-actions';

const CATEGORIES = ['legal', 'privacy', 'commerce', 'creator', 'security', 'general'] as const;
const AUDIENCES = ['all', 'creators', 'media', 'developers', 'subscribers'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  legal: 'Juridique',
  privacy: 'Vie privée',
  commerce: 'Commerce',
  creator: 'Créateurs',
  security: 'Sécurité',
  general: 'Général',
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Tout le monde',
  creators: 'Créateurs',
  media: 'Médias',
  developers: 'Développeurs',
  subscribers: 'Abonnés',
};

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-success/10 text-success ring-success/20',
  DRAFT: 'bg-highlight/15 text-foreground ring-highlight/40',
  ARCHIVED: 'bg-muted text-muted-foreground ring-border',
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Publiée',
  DRAFT: 'Brouillon',
  ARCHIVED: 'Archivée',
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function inputClass(extra = '') {
  return `w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 ${extra}`;
}

interface VersionDraft {
  id: string | null;
  locale: string;
  version: string;
  title: string;
  summary: string;
  body: string;
  changelog: string;
  effectiveAt: string;
}

const EMPTY_VERSION: VersionDraft = {
  id: null,
  locale: 'fr',
  version: '',
  title: '',
  summary: '',
  body: '',
  changelog: '',
  effectiveAt: '',
};

interface LegalCMSProps {
  documents: AdminLegalDocument[];
  acceptances: AdminLegalAcceptance[];
  stats: AdminLegalStats[];
}

export function LegalCMS({ documents, acceptances, stats }: LegalCMSProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'documents' | 'consents'>('documents');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(documents[0]?.id ?? null);
  const [versions, setVersions] = useState<LegalVersionRow[]>([]);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [draft, setDraft] = useState<VersionDraft | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => documents.find((doc) => doc.id === selectedId) ?? null,
    [documents, selectedId]
  );

  const statsBySlug = useMemo(() => {
    const map = new Map<string, AdminLegalStats>();
    for (const item of stats) map.set(item.slug, item);
    return map;
  }, [stats]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((doc) =>
      [doc.slug, doc.publishedTitle ?? '', doc.category, doc.audience]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [documents, search]);

  const consentTotals = useMemo(
    () => ({
      total: stats.reduce((acc, item) => acc + item.acceptances, 0),
      last30d: stats.reduce((acc, item) => acc + item.acceptances30d, 0),
      required: stats.filter((item) => item.requiresAcceptance).length,
    }),
    [stats]
  );

  function notify(tone: 'ok' | 'error', text: string) {
    setFeedback({ tone, text });
  }

  function refresh() {
    startTransition(async () => {
      router.refresh();
      if (selectedId) await loadVersions(selectedId);
    });
  }

  async function loadVersions(documentId: string) {
    setLoadingVersions(true);
    try {
      const rows = await loadLegalVersionsAction(documentId);
      setVersions(rows);
      setVersionsFor(documentId);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoadingVersions(false);
    }
  }

  function selectDocument(documentId: string) {
    setSelectedId(documentId);
    setDraft(null);
    setVersions([]);
    setVersionsFor(null);
    void loadVersions(documentId);
  }

  function editVersion(version: LegalVersionRow) {
    setDraft({
      id: version.id,
      locale: version.locale,
      version: version.version,
      title: version.title,
      summary: version.summary ?? '',
      body: version.body ?? '',
      changelog: version.changelog ?? '',
      effectiveAt: version.effectiveAt ? version.effectiveAt.slice(0, 10) : '',
    });
    setShowPreview(false);
  }

  function saveDraft() {
    if (!draft || !selected) return;
    startTransition(async () => {
      const payload = {
        locale: draft.locale,
        version: draft.version,
        title: draft.title,
        summary: draft.summary,
        body: draft.body,
        changelog: draft.changelog,
        effectiveAt: draft.effectiveAt,
      };
      const res = draft.id
        ? await updateLegalVersionAction(draft.id, payload)
        : await createLegalVersionAction(selected.id, payload);
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      notify('ok', draft.id ? 'Brouillon enregistré.' : 'Nouvelle version créée en brouillon.');
      setDraft(null);
      await loadVersions(selected.id);
      router.refresh();
    });
  }

  function publish(version: LegalVersionRow) {
    if (
      !confirm(
        `Publier la version ${version.version} (${version.locale.toUpperCase()}) ?\n\n` +
          'La version publiée actuelle sera archivée et les consentements en attente seront redéclenchés.'
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await publishLegalVersionAction(version.id);
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      notify('ok', `Version ${version.version} publiée.`);
      if (selected) await loadVersions(selected.id);
      router.refresh();
    });
  }

  function archive(version: LegalVersionRow) {
    if (!confirm(`Archiver la version ${version.version} ? Elle disparaîtra du public.`)) return;
    startTransition(async () => {
      const res = await archiveLegalVersionAction(version.id);
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      notify('ok', `Version ${version.version} archivée.`);
      if (selected) await loadVersions(selected.id);
      router.refresh();
    });
  }

  function removeDraft(version: LegalVersionRow) {
    if (!confirm(`Supprimer le brouillon ${version.version} ?`)) return;
    startTransition(async () => {
      const res = await deleteLegalDraftAction(version.id);
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      notify('ok', 'Brouillon supprimé.');
      if (selected) await loadVersions(selected.id);
      router.refresh();
    });
  }

  function removeDocument(doc: AdminLegalDocument) {
    if (
      !confirm(
        `Supprimer « ${doc.slug} », toutes ses versions ET toutes ses preuves de consentement ?\n\n` +
          'Cette action est irréversible — préférez archiver la version publiée.'
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteLegalDocumentAction(doc.id);
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      notify('ok', 'Document supprimé.');
      setSelectedId(null);
      setVersions([]);
      router.refresh();
    });
  }

  function seed() {
    startTransition(async () => {
      const res = await seedLegalDefaultsAction();
      if (!res.success) {
        notify('error', res.error);
        return;
      }
      const summary = res.result as
        { created?: number; enriched?: number; skipped?: number; missing?: string[] } | undefined;
      const created = summary?.created ?? 0;
      const enriched = summary?.enriched ?? 0;
      const parts = [`${created} document(s) créé(s)`];
      if (enriched > 0) parts.push(`${enriched} complété(s) (locale manquante)`);
      if ((summary?.skipped ?? 0) > 0) parts.push(`${summary?.skipped} déjà présent(s)`);
      if (summary?.missing?.length) parts.push(`${summary.missing.length} fichier(s) manquant(s)`);
      notify('ok', `Contenu embarqué : ${parts.join(', ')}.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-white p-1">
          <button
            onClick={() => setTab('documents')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'documents' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> Documents
          </button>
          <button
            onClick={() => setTab('consents')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'consents' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Consentements
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={seed}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Installer les manquants
          </button>
          <button
            onClick={refresh}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === 'ok'
              ? 'border-success/20 bg-success/5 text-success'
              : 'border-destructive/20 bg-destructive/5 text-destructive'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {tab === 'documents' ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Liste des documents */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un document…"
                className={inputClass('pl-9')}
              />
            </div>

            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {filtered.map((doc) => {
                const docStats = statsBySlug.get(doc.slug);
                const isActive = doc.id === selectedId;
                return (
                  <button
                    key={doc.id}
                    onClick={() => selectDocument(doc.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-white hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {doc.publishedTitle ?? doc.slug}
                      </span>
                      {doc.requiresAcceptance && (
                        <span className="shrink-0 rounded-full bg-highlight/15 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-highlight/40">
                          à accepter
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{doc.slug}</span>
                      <span>·</span>
                      <span>{CATEGORY_LABELS[doc.category] ?? doc.category}</span>
                      {!doc.isActive && (
                        <>
                          <span>·</span>
                          <span className="text-destructive">inactif</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {doc.publishedVersion ? `v${doc.publishedVersion}` : 'non publié'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" /> {doc.versionsCount}
                      </span>
                      {doc.draftsCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <Clock className="h-3 w-3" /> {doc.draftsCount} brouillon(s)
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {docStats?.acceptances ?? 0}
                      </span>
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  Aucun document. Utilise « Installer les manquants » pour charger le contenu
                  embarqué.
                </p>
              )}
            </div>

            <button
              onClick={() => setCreatingDoc(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Nouveau document
            </button>
          </div>

          {/* Détail du document */}
          <div className="space-y-6">
            {!selected ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                Sélectionne un document à gauche pour éditer ses versions.
              </div>
            ) : (
              <>
                <DocumentMeta
                  key={selected.id}
                  document={selected}
                  pending={isPending}
                  onSave={(input) =>
                    startTransition(async () => {
                      const res = await updateLegalDocumentAction(selected.id, input);
                      if (!res.success) {
                        notify('error', res.error);
                        return;
                      }
                      notify('ok', 'Métadonnées enregistrées.');
                      router.refresh();
                    })
                  }
                  onDelete={() => removeDocument(selected)}
                />

                <div className="rounded-2xl border border-border bg-white">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Versions</h2>
                      {loadingVersions && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    </div>
                    <button
                      onClick={() => {
                        setDraft({ ...EMPTY_VERSION });
                        setShowPreview(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Nouvelle version
                    </button>
                  </div>

                  <ul className="divide-y divide-border/60">
                    {(versionsFor === selected.id ? versions : []).map((version) => (
                      <li
                        key={version.id}
                        className="flex items-start justify-between gap-4 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                                STATUS_STYLES[version.status]
                              }`}
                            >
                              {STATUS_LABELS[version.status]}
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                              v{version.version}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                              {version.locale}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-foreground">{version.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {version.status === 'PUBLISHED'
                              ? `publiée le ${formatDate(version.publishedAt)}`
                              : version.status === 'ARCHIVED'
                                ? `archivée le ${formatDate(version.archivedAt)}`
                                : `créée le ${formatDate(version.createdAt)}`}
                            {version.effectiveAt
                              ? ` · en vigueur le ${formatDate(version.effectiveAt)}`
                              : ''}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {version.status === 'DRAFT' && (
                            <>
                              <button
                                onClick={() => editVersion(version)}
                                className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                              >
                                Éditer
                              </button>
                              <button
                                onClick={() => publish(version)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 rounded-lg bg-success px-2 py-1 text-[11px] font-semibold text-success-foreground hover:opacity-90 disabled:opacity-50"
                              >
                                <Rocket className="h-3 w-3" /> Publier
                              </button>
                              <button
                                onClick={() => removeDraft(version)}
                                className="rounded-lg border border-border p-1 text-destructive hover:bg-destructive/5"
                                aria-label="Supprimer le brouillon"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {version.status === 'PUBLISHED' && (
                            <button
                              onClick={() => archive(version)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                            >
                              <Archive className="h-3 w-3" /> Archiver
                            </button>
                          )}
                          {version.status === 'ARCHIVED' && (
                            <span className="text-[11px] text-muted-foreground">immuable</span>
                          )}
                        </div>
                      </li>
                    ))}

                    {versionsFor === selected.id && versions.length === 0 && !loadingVersions && (
                      <li className="px-5 py-6 text-center text-xs text-muted-foreground">
                        Aucune version pour ce document.
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Consentements enregistrés"
              value={consentTotals.total}
              icon={CheckCircle2}
            />
            <StatCard label="30 derniers jours" value={consentTotals.last30d} icon={Clock} />
            <StatCard
              label="Documents à accepter"
              value={consentTotals.required}
              icon={ShieldCheck}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Volumétrie par document</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Consentement</th>
                    <th className="px-4 py-3">Acceptations</th>
                    <th className="px-4 py-3">30 jours</th>
                    <th className="px-4 py-3">Versions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stats.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{item.slug}</td>
                      <td className="px-4 py-3 text-xs">
                        {item.requiresAcceptance ? (
                          <span className="rounded-full bg-highlight/15 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-highlight/40">
                            requis
                          </span>
                        ) : (
                          <span className="text-muted-foreground">informatif</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">{item.acceptances}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{item.acceptances30d}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{item.versionsCount}</td>
                    </tr>
                  ))}
                  {stats.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-xs text-muted-foreground"
                      >
                        Aucune preuve de consentement enregistrée pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Dernières preuves ({acceptances.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Quand</th>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Compte</th>
                    <th className="px-4 py-3">Origine</th>
                    <th className="px-4 py-3">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {acceptances.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(row.acceptedAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {row.documentSlug ?? row.documentId}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        v{row.version} · {row.locale}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        {row.userEmail ?? row.source}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.source} / {row.method}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {row.ip ?? '—'}
                      </td>
                    </tr>
                  ))}
                  {acceptances.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-xs text-muted-foreground"
                      >
                        Rien à afficher.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {draft && selected && (
        <VersionEditorModal
          title={`${selected.slug} — ${draft.id ? 'éditer le brouillon' : 'nouvelle version'}`}
          draft={draft}
          showPreview={showPreview}
          pending={isPending}
          onChange={setDraft}
          onTogglePreview={() => setShowPreview((value) => !value)}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}

      {creatingDoc && (
        <NewDocumentModal
          pending={isPending}
          onClose={() => setCreatingDoc(false)}
          onCreate={(input) =>
            startTransition(async () => {
              const res = await createLegalDocumentAction(input);
              if (!res.success) {
                notify('error', res.error);
                return;
              }
              notify('ok', 'Document créé.');
              setCreatingDoc(false);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

// ── Métadonnées du document ────────────────────────────────────────────

interface DocumentMetaProps {
  document: AdminLegalDocument;
  pending: boolean;
  onSave: (input: {
    slug: string;
    category: string;
    audience: string;
    requiresAcceptance: boolean;
    isActive: boolean;
    sortOrder: number;
  }) => void;
  onDelete: () => void;
}

function DocumentMeta({ document, pending, onSave, onDelete }: DocumentMetaProps) {
  const [slug, setSlug] = useState(document.slug);
  const [category, setCategory] = useState(document.category);
  const [audience, setAudience] = useState(document.audience);
  const [requiresAcceptance, setRequiresAcceptance] = useState(document.requiresAcceptance);
  const [isActive, setIsActive] = useState(document.isActive);
  const [sortOrder, setSortOrder] = useState(String(document.sortOrder));

  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Réglages éditoriaux</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/legal/${document.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-3 w-3" /> Voir la page
          </a>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/5"
          >
            <Trash2 className="h-3 w-3" /> Supprimer
          </button>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Slug public
          </span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass()} />
          <span className="block text-[11px] text-muted-foreground">
            URL : /legal/{slug || '…'}
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ordre d&apos;affichage
          </span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputClass()}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Catégorie
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass()}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Audience
          </span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass()}
          >
            {AUDIENCES.map((value) => (
              <option key={value} value={value}>
                {AUDIENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
          <input
            type="checkbox"
            checked={requiresAcceptance}
            onChange={(e) => setRequiresAcceptance(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs text-foreground">
            <span className="font-semibold">Consentement obligatoire</span>
            <span className="mt-0.5 block text-muted-foreground">
              Un changement de version redéclenche l&apos;acceptation des utilisateurs concernés.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs text-foreground">
            <span className="font-semibold">Publié sur les sites</span>
            <span className="mt-0.5 block text-muted-foreground">
              Décoche pour retirer le document de l&apos;index public sans l&apos;effacer.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end border-t border-border px-5 py-4">
        <button
          onClick={() =>
            onSave({
              slug,
              category,
              audience,
              requiresAcceptance,
              isActive,
              sortOrder: Number(sortOrder) || 100,
            })
          }
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </button>
      </div>
    </div>
  );
}

// ── Éditeur de version ────────────────────────────────────────────────

interface VersionEditorModalProps {
  title: string;
  draft: VersionDraft;
  showPreview: boolean;
  pending: boolean;
  onChange: (draft: VersionDraft) => void;
  onTogglePreview: () => void;
  onClose: () => void;
  onSave: () => void;
}

function VersionEditorModal({
  title,
  draft,
  showPreview,
  pending,
  onChange,
  onTogglePreview,
  onClose,
  onSave,
}: VersionEditorModalProps) {
  const isEdit = Boolean(draft.id);
  const previewHtml = useMemo(() => markdownToHtml(draft.body), [draft.body]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 backdrop-blur-sm md:p-8">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-[11px] text-muted-foreground">
              Markdown supporté : titres, listes, tableaux, citations, liens. Le HTML brut est
              neutralisé.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Locale
            </span>
            <select
              value={draft.locale}
              disabled={isEdit}
              onChange={(e) => onChange({ ...draft, locale: e.target.value })}
              className={inputClass('disabled:opacity-60')}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Version (semver)
            </span>
            <input
              value={draft.version}
              disabled={isEdit}
              onChange={(e) => onChange({ ...draft, version: e.target.value })}
              placeholder="1.1.0"
              className={inputClass('font-mono disabled:opacity-60')}
            />
          </label>

          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Titre
            </span>
            <input
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className={inputClass()}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Résumé (meta description)
            </span>
            <input
              value={draft.summary}
              onChange={(e) => onChange({ ...draft, summary: e.target.value })}
              className={inputClass()}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Entrée en vigueur
            </span>
            <input
              type="date"
              value={draft.effectiveAt}
              onChange={(e) => onChange({ ...draft, effectiveAt: e.target.value })}
              className={inputClass()}
            />
          </label>

          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Journal des modifications
            </span>
            <input
              value={draft.changelog}
              onChange={(e) => onChange({ ...draft, changelog: e.target.value })}
              placeholder="Ex. : ajout de l'article 9 sur les paiements"
              className={inputClass()}
            />
          </label>

          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contenu
              </span>
              <button
                onClick={onTogglePreview}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
              >
                <Eye className="h-3 w-3" /> {showPreview ? 'Éditer' : 'Aperçu'}
              </button>
            </div>

            {showPreview ? (
              <div
                className="prose prose-sm max-h-[420px] overflow-y-auto rounded-xl border border-border px-4 py-3 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                value={draft.body}
                onChange={(e) => onChange({ ...draft, body: e.target.value })}
                rows={18}
                className={inputClass('font-mono text-[12px] leading-relaxed')}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            disabled={pending || !draft.title.trim() || !draft.body.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEdit ? 'Enregistrer le brouillon' : 'Créer le brouillon'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Création d'un document ────────────────────────────────────────────

interface NewDocumentModalProps {
  pending: boolean;
  onClose: () => void;
  onCreate: (input: {
    slug: string;
    category: string;
    audience: string;
    requiresAcceptance: boolean;
    locale: string;
    version: string;
    title: string;
    summary: string;
    body: string;
    changelog: string;
    publish: boolean;
  }) => void;
}

function NewDocumentModal({ pending, onClose, onCreate }: NewDocumentModalProps) {
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('legal');
  const [audience, setAudience] = useState<string>('all');
  const [requiresAcceptance, setRequiresAcceptance] = useState(false);
  const [publish, setPublish] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 backdrop-blur-sm md:p-8">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Nouveau document juridique</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Slug
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="politique-remboursement"
              className={inputClass('font-mono')}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Titre
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass()}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Catégorie
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass()}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Audience
            </span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className={inputClass()}
            >
              {AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Résumé
            </span>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className={inputClass()}
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contenu (markdown)
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={inputClass('font-mono text-[12px]')}
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <input
              type="checkbox"
              checked={requiresAcceptance}
              onChange={(e) => setRequiresAcceptance(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs font-semibold text-foreground">Consentement obligatoire</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs font-semibold text-foreground">Publier immédiatement</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              onCreate({
                slug,
                category,
                audience,
                requiresAcceptance,
                locale: 'fr',
                version: '1.0.0',
                title,
                summary,
                body,
                changelog: 'Version initiale',
                publish,
              })
            }
            disabled={pending || !slug.trim() || !title.trim() || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
