'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Search, UserRound, X } from 'lucide-react';
import { searchArticleContributorsAction } from '@qoe/sdk/actions/articles';
import { cn } from '@qoe/utils';

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
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      {person.logoUrl ? (
        <Image src={person.logoUrl} alt="" fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-primary">
          {(person.name || person.username || 'A').slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function ArticleAttributionEditor({
  value,
  onChange,
}: {
  value: ArticleAttributionDraft[];
  onChange: (next: ArticleAttributionDraft[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContributorResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Attribution éditoriale
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Définissez qui signe l’article, dans quel ordre, et ce qui apparaît dans le feed.
        </p>
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
    </div>
  );
}
