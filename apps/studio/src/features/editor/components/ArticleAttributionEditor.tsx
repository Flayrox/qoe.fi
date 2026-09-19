'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  searchArticleContributorsAction,
  createCollaborationInviteLinkAction,
  listCollaborationInviteLinksAction,
  revokeCollaborationInviteLinkAction,
  type CollaborationInviteLinkDTO,
} from '@qoe/sdk/actions/articles';
import { cn } from '@qoe/utils';
import { SafeAvatar } from '@qoe/ui';

export type ArticleAttributionDraft = {
  userId: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
  role: string;
  order: number;
  isVisible: boolean;
  consentStatus?: string;
};

const ROLE_OPTIONS = [
  { value: 'PRIMARY_AUTHOR', label: 'Auteur principal' },
  { value: 'CO_AUTHOR', label: 'Co-auteur' },
  { value: 'EDITOR', label: 'Éditeur' },
  { value: 'CONTRIBUTOR', label: 'Contributeur' },
  { value: 'TRANSLATOR', label: 'Traducteur' },
  { value: 'PHOTOGRAPHER', label: 'Photographe' },
];

type ContributorResult = Omit<ArticleAttributionDraft, 'role' | 'order' | 'isVisible'>;

function Avatar({ person, size = 28 }: { person: ContributorResult; size?: number }) {
  return (
    <SafeAvatar
      src={person.logoUrl}
      name={person.name}
      username={person.username}
      size={size}
      shape="circle"
      className="shrink-0"
    />
  );
}

function formatExpiry(dateStr: string | null) {
  if (!dateStr) return 'Permanent';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ArticleAttributionEditor({
  value,
  onChange,
  articleId,
}: {
  value: ArticleAttributionDraft[];
  onChange: (next: ArticleAttributionDraft[]) => void;
  articleId?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContributorResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Gestion des liens de collaboration
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [links, setLinks] = useState<CollaborationInviteLinkDTO[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkRole, setLinkRole] = useState('CONTRIBUTOR');
  const [linkExpiresIn, setLinkExpiresIn] = useState(24);
  const [linkMaxUses, setLinkMaxUses] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [latestCreatedUrl, setLatestCreatedUrl] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (!articleId) return;
    setLoadingLinks(true);
    try {
      const res = await listCollaborationInviteLinksAction(articleId);
      if (res.ok && res.data) {
        setLinks(res.data.links || []);
      }
    } finally {
      setLoadingLinks(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (showLinkModal && articleId) {
      fetchLinks();
    }
  }, [showLinkModal, articleId, fetchLinks]);

  const handleCreateLink = async () => {
    if (!articleId) return;
    setCreatingLink(true);
    try {
      const res = await createCollaborationInviteLinkAction({
        articleId,
        role: linkRole,
        expiresInHours: linkExpiresIn,
        maxUses: linkMaxUses,
      });
      if (res.ok && res.data?.link) {
        const joinUrl = `${window.location.origin}/collaborate/join?token=${res.data.link.token}`;
        setLatestCreatedUrl(joinUrl);
        setLinks((prev) => [res.data.link, ...prev]);
      }
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    const res = await revokeCollaborationInviteLinkAction(linkId);
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const selectedIds = useMemo(() => new Set(value.map((item) => item.userId)), [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      const response = await searchArticleContributorsAction({
        query: trimmed,
        excludeIds: [...selectedIds],
      });
      if (!cancelled) {
        setResults(
          response.ok
            ? response.data.map((person) => ({
                userId: person.id,
                name: person.name,
                username: person.username,
                logoUrl: person.logoUrl,
                isCertified: person.isCertified,
              }))
            : []
        );
        setIsSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedIds]);

  const update = (index: number, patch: Partial<ArticleAttributionDraft>) => {
    onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= value.length) return;
    if (value[index]?.role === 'PRIMARY_AUTHOR' || value[nextIndex]?.role === 'PRIMARY_AUTHOR') {
      return;
    }
    const next = [...value];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next.map((item, itemIndex) => ({ ...item, order: itemIndex })));
  };

  const addContributor = (person: ContributorResult) => {
    if (selectedIds.has(person.userId)) return;
    onChange([
      ...value,
      {
        ...person,
        role: 'CO_AUTHOR',
        order: value.length,
        isVisible: false,
        consentStatus: 'PENDING',
      },
    ]);
    setQuery('');
    setResults([]);
  };

  const removeContributor = (index: number) => {
    if (value[index]?.role === 'PRIMARY_AUTHOR') return;
    onChange(
      value
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, order: itemIndex }))
    );
  };

  return (
    <div className="space-y-3" data-testid="article-attribution-editor">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Attribution éditoriale
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Définissez qui signe l’article, dans quel ordre, et ce qui apparaît dans le feed.
          </p>
        </div>
        {articleId && (
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shrink-0"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Lien d’invitation</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {value.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/50 p-2.5 text-[11px] text-muted-foreground">
            <UserRound className="h-4 w-4 shrink-0" />
            <span>Vous serez ajouté comme auteur principal à la sauvegarde.</span>
          </div>
        ) : (
          value.map((person, index) => (
            <div
              key={person.userId}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 p-2"
              data-testid={`attribution-row-${person.userId}`}
            >
              <Avatar person={person} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-foreground">
                  {person.name || person.username || 'Contributeur'}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  @{person.username || person.userId.slice(0, 8)}
                </div>
                {person.role !== 'PRIMARY_AUTHOR' && (
                  <div className="text-[10px] text-highlight">
                    {person.consentStatus === 'ACCEPTED'
                      ? 'Consentement accepté'
                      : 'Invitation à accepter'}
                  </div>
                )}
              </div>
              <select
                aria-label={`Rôle de ${person.name || person.username || 'contributeur'}`}
                value={person.role}
                disabled={person.role === 'PRIMARY_AUTHOR'}
                onChange={(event) => update(index, { role: event.target.value })}
                className="max-w-[130px] rounded-md border border-border/40 bg-card px-1.5 py-1 text-[10px] text-foreground"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              {person.role !== 'PRIMARY_AUTHOR' && (
                <span
                  className={cn(
                    'rounded-md px-1.5 py-1 text-[10px]',
                    person.consentStatus === 'ACCEPTED'
                      ? person.isVisible
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                      : 'bg-highlight/10 text-highlight'
                  )}
                >
                  {person.consentStatus === 'ACCEPTED'
                    ? person.isVisible
                      ? 'Cité'
                      : 'Non cité'
                    : 'En attente'}
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Monter le contributeur"
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Descendre le contributeur"
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                {person.role !== 'PRIMARY_AUTHOR' && (
                  <button
                    type="button"
                    onClick={() => removeContributor(index)}
                    aria-label={`Retirer ${person.name || 'le contributeur'}`}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ajouter un contributeur..."
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
            data-testid="attribution-search"
          />
          {isSearching && <span className="text-[10px] text-muted-foreground">Recherche…</span>}
        </div>
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border/50 bg-card p-1 shadow-xl">
            {results.map((person) => (
              <button
                key={person.userId}
                type="button"
                onClick={() => addContributor(person)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted"
              >
                <Avatar person={person} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {person.name || person.username || 'Contributeur'}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    @{person.username || person.userId.slice(0, 8)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        L’auteur principal reste toujours affiché. Les autres rôles peuvent être masqués de la
        signature publique sans perdre la collaboration interne.
      </p>

      {/* Modal de partage par lien */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-border/50 bg-card p-6 shadow-2xl space-y-5 font-sans max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Lien de collaboration
                </h2>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Générez un lien d’invitation pour co-rédiger cet article. Les personnes disposant
                  du lien peuvent rejoindre la co-rédaction sans renseigner d’adresse email.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  setLatestCreatedUrl(null);
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulaire de création */}
            <div className="rounded-xl border border-border/40 bg-background/50 p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Créer un nouveau lien
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Rôle accordé
                  </label>
                  <select
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value)}
                    className="w-full rounded-lg border border-border/40 bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="CONTRIBUTOR">Contributeur</option>
                    <option value="CO_AUTHOR">Co-auteur</option>
                    <option value="EDITOR">Éditeur</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Durée de validité
                  </label>
                  <select
                    value={linkExpiresIn}
                    onChange={(e) => setLinkExpiresIn(Number(e.target.value))}
                    className="w-full rounded-lg border border-border/40 bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value={24}>24 heures</option>
                    <option value={168}>7 jours</option>
                    <option value={720}>30 jours</option>
                    <option value={0}>Permanent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Utilisations max
                  </label>
                  <select
                    value={linkMaxUses}
                    onChange={(e) => setLinkMaxUses(Number(e.target.value))}
                    className="w-full rounded-lg border border-border/40 bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value={1}>1 seule fois</option>
                    <option value={5}>5 utilisations</option>
                    <option value={10}>10 utilisations</option>
                    <option value={0}>Illimité</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={creatingLink}
                onClick={handleCreateLink}
                className="w-full mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {creatingLink ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                <span>Générer le lien d’invitation</span>
              </button>
            </div>

            {/* Bannière du dernier lien créé */}
            {latestCreatedUrl && (
              <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-success">
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Lien prêt à être partagé !
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(latestCreatedUrl, 'latest')}
                    className="flex items-center gap-1 rounded bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success hover:bg-success/30 transition-colors"
                  >
                    {copiedId === 'latest' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedId === 'latest' ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
                <input
                  readOnly
                  value={latestCreatedUrl}
                  onFocus={(e) => e.target.select()}
                  className="w-full rounded border border-success/20 bg-background/80 px-2.5 py-1 text-xs text-foreground font-sans focus:outline-none"
                />
              </div>
            )}

            {/* Liste des liens actifs */}
            <div className="space-y-2 pt-2 border-t border-border/30">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Liens actifs pour cet article
              </h3>

              {loadingLinks ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Chargement des liens…
                </div>
              ) : links.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">
                  Aucun lien actif généré pour cet article.
                </p>
              ) : (
                <div className="divide-y divide-border/20 max-h-48 overflow-y-auto pr-1">
                  {links.map((link) => {
                    const joinUrl = `${window.location.origin}/collaborate/join?token=${link.token}`;
                    return (
                      <div
                        key={link.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {link.role === 'CO_AUTHOR'
                                ? 'Co-auteur'
                                : link.role === 'EDITOR'
                                  ? 'Éditeur'
                                  : 'Contributeur'}
                            </span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {link.expiresAt
                                ? `Expire le ${formatExpiry(link.expiresAt)}`
                                : 'Permanent'}
                            </span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {link.usedCount} / {link.maxUses > 0 ? link.maxUses : '∞'}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate font-sans">
                            {joinUrl}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(joinUrl, link.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            aria-label="Copier le lien"
                            title="Copier le lien"
                          >
                            {copiedId === link.id ? (
                              <Check className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeLink(link.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label="Révoquer le lien"
                            title="Révoquer le lien"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
