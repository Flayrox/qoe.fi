'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { searchArticleContributorsAction } from '@qoe/sdk/actions/articles';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, InputGroup } from '@qoe/ui/input';
import { SafeAvatar } from '@qoe/ui';
import { Select } from '@qoe/ui/select';
import { CollaborationInviteLinks } from './CollaborationInviteLinks';

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

function visibilityLabel(person: ArticleAttributionDraft) {
  if (person.consentStatus !== 'ACCEPTED') return 'En attente';
  return person.isVisible ? 'Cité' : 'Non cité';
}

function VisibilityButton({
  person,
  onToggle,
}: {
  person: ArticleAttributionDraft;
  onToggle: () => void;
}) {
  const waiting = person.consentStatus !== 'ACCEPTED';
  return (
    <Button
      variant="soft"
      tone={waiting ? 'brand' : person.isVisible ? 'success' : 'neutral'}
      size="xs"
      onClick={onToggle}
      disabled={waiting}
      aria-pressed={person.isVisible}
      title={
        waiting
          ? 'En attente du consentement du contributeur'
          : person.isVisible
            ? 'Masquer de la signature publique'
            : 'Afficher dans la signature publique'
      }
      className="gap-1 px-1.5 text-[10px]"
    >
      {waiting ? (
        <Clock aria-hidden />
      ) : person.isVisible ? (
        <Eye aria-hidden />
      ) : (
        <EyeOff aria-hidden />
      )}
      {visibilityLabel(person)}
    </Button>
  );
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
  const [showLinkModal, setShowLinkModal] = useState(false);

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
        isVisible: true,
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
          <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Attribution éditoriale
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Définissez qui signe l’article, dans quel ordre, et ce qui apparaît dans le feed.
          </p>
        </div>
        {articleId && (
          <Button
            variant="soft"
            tone="brand"
            size="xs"
            onClick={() => setShowLinkModal(true)}
            className="shrink-0"
          >
            <Link2 aria-hidden />
            Lien d’invitation
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {value.length === 0 ? (
          <div className="flex items-center gap-2 rounded-control border border-dashed border-border/50 p-2.5 text-[11px] text-muted-foreground">
            <UserRound className="size-4 shrink-0" aria-hidden />
            <span>Vous serez ajouté comme auteur principal à la sauvegarde.</span>
          </div>
        ) : (
          value.map((person, index) => (
            <div
              key={person.userId}
              className="flex items-center gap-2 rounded-control border border-border/40 bg-background/60 p-2"
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
                  <Badge
                    variant="soft"
                    tone={person.consentStatus === 'ACCEPTED' ? 'success' : 'vivid'}
                    className="mt-0.5"
                  >
                    {person.consentStatus === 'ACCEPTED'
                      ? 'Consentement accepté'
                      : 'Invitation à accepter'}
                  </Badge>
                )}
              </div>
              <Select
                label={`Rôle de ${person.name || person.username || 'contributeur'}`}
                hideLabel
                size="xs"
                className="max-w-[130px]"
                value={person.role}
                disabled={person.role === 'PRIMARY_AUTHOR'}
                onValueChange={(role) => update(index, { role })}
                options={ROLE_OPTIONS.map((role) => ({ id: role.value, label: role.label }))}
              />
              {person.role !== 'PRIMARY_AUTHOR' && (
                <VisibilityButton
                  person={person}
                  onToggle={() => update(index, { isVisible: !person.isVisible })}
                />
              )}
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="xs"
                  shape="icon"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Monter le contributeur"
                  title="Monter le contributeur"
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  shape="icon"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Descendre le contributeur"
                  title="Descendre le contributeur"
                >
                  <ArrowDown aria-hidden />
                </Button>
                {person.role !== 'PRIMARY_AUTHOR' && (
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="xs"
                    shape="icon"
                    onClick={() => removeContributor(index)}
                    aria-label={`Retirer ${person.name || 'le contributeur'}`}
                    title="Retirer le contributeur"
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="relative">
        <InputGroup
          size="sm"
          left={<Search aria-hidden />}
          right={isSearching ? <Loader2 className="animate-spin" aria-hidden /> : undefined}
        >
          <Input
            type="search"
            size="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ajouter un contributeur..."
            aria-label="Rechercher un contributeur"
            className="text-xs"
            data-testid="attribution-search"
          />
        </InputGroup>
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-panel border border-border/50 bg-card p-1 shadow-xl">
            {results.map((person) => (
              <Button
                key={person.userId}
                variant="ghost"
                size="sm"
                onClick={() => addContributor(person)}
                className="h-auto w-full justify-start gap-2 whitespace-normal p-2 text-left"
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
              </Button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        L’auteur principal reste toujours affiché. Les autres rôles peuvent être masqués de la
        signature publique sans perdre la collaboration interne.
      </p>

      {articleId && (
        <CollaborationInviteLinks
          articleId={articleId}
          open={showLinkModal}
          onOpenChange={setShowLinkModal}
        />
      )}
    </div>
  );
}
