'use client';

import React, { useState, useEffect, useRef } from 'react';
import { t } from '@lingui/core/macro';
import {
  Search as SearchIcon,
  X,
  Loader2,
  User as UserIcon,
  MessageSquare,
  FileText,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import {
  useSearchQuery,
  useInfiniteArticlesQuery,
  useInfiniteThoughtsQuery,
  useSemanticSearchQuery,
} from '@qoe/sdk';
import { ThoughtCard } from './ThoughtCard';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';
import Link from 'next/link';
import { routes, getArticleUrl } from '@qoe/config/routes';
import type { QuotedArticleData } from '@qoe/ui';
import {
  useArticleOverlay,
  type OpenArticleInput,
} from '@/components/article-overlay/ArticleOverlayProvider';
import { useThoughtOverlay } from '@/components/thought-overlay/context';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import {
  hasResultsForTab,
  mergeArticlePages,
  mergeThoughtPages,
  toIsoOrUndefined,
  type SearchTab,
} from './search-results';

interface OpenedArticle {
  id: string;
  title: string;
  slug: string;
  content?: string | null;
  isPremium?: boolean;
  createdAt?: string | number;
  authorId?: string;
}

export function SearchFeed({ initialQuery = '' }: { initialQuery?: string }) {
  const articleOverlay = useArticleOverlay();
  const thoughtOverlay = useThoughtOverlay();
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasQuery = query.trim().length > 0;

  // Recherche combinée : elle porte les compteurs d'onglets et les profils.
  // L'entité de l'onglet actif est exclue pour ne pas charger deux fois sa
  // première page : elle vient de sa propre requête infinie (« Charger plus »).
  const base = useSearchQuery(query, 'all', {
    skipThoughts: activeTab === 'thoughts',
    skipArticles: activeTab === 'articles',
  });
  const infiniteArticles = useInfiniteArticlesQuery(query, hasQuery && activeTab === 'articles');
  const infiniteThoughts = useInfiniteThoughtsQuery(query, hasQuery && activeTab === 'thoughts');
  const semantic = useSemanticSearchQuery(query, hasQuery && activeTab === 'semantic');

  // Raccourci clavier "/" pour focus la recherche
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        !(
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const pagedThoughts = mergeThoughtPages(infiniteThoughts.data?.pages);
  const thoughts = activeTab === 'thoughts' ? pagedThoughts : base.data?.thoughts || [];
  const users = base.data?.users || [];
  const firstPageArticles = base.data?.articles || [];
  const pagedArticles = mergeArticlePages(infiniteArticles.data?.pages);
  const articles = activeTab === 'articles' ? pagedArticles : firstPageArticles;
  const semanticItems = semantic.data?.items || [];

  const counts = {
    thoughts: thoughts.length,
    users: users.length,
    articles: articles.length,
    semantic: semanticItems.length,
  };

  const isLoading =
    activeTab === 'semantic'
      ? semantic.isLoading
      : activeTab === 'articles'
        ? infiniteArticles.isLoading
        : activeTab === 'thoughts'
          ? infiniteThoughts.isLoading
          : base.isLoading;
  const isError =
    activeTab === 'semantic'
      ? semantic.isError
      : activeTab === 'articles'
        ? infiniteArticles.isError
        : activeTab === 'thoughts'
          ? infiniteThoughts.isError
          : base.isError;

  const articleCountLabel = (() => {
    if (activeTab === 'articles') return String(pagedArticles.length);
    if (base.data?.articlesNextCursor) return `${firstPageArticles.length}+`;
    return String(firstPageArticles.length);
  })();

  const thoughtCountLabel = (() => {
    if (activeTab === 'thoughts') return String(pagedThoughts.length);
    if (base.data?.nextCursor) return `${thoughts.length}+`;
    return String(thoughts.length);
  })();

  // Un onglet paginé ne doit pas afficher « aucun résultat » tant qu'il reste
  // une page à charger (la page courante peut être entièrement filtrée).
  const showNoResults =
    !hasResultsForTab(activeTab, counts) &&
    !(activeTab === 'articles' && infiniteArticles.hasNextPage) &&
    !(activeTab === 'thoughts' && infiniteThoughts.hasNextPage) &&
    // L'onglet « tous » montre la première page de chaque entité : si l'une
    // annonce un curseur, le serveur en a d'autres derrière (le bouton
    // « Parcourir tous les articles » dit déjà le contraire de « aucun résultat »).
    !(activeTab === 'all' && Boolean(base.data?.nextCursor || base.data?.articlesNextCursor));

  const openArticle = (art: OpenedArticle) => {
    if (!art.slug) return;
    const input: OpenArticleInput = {
      id: art.id,
      title: art.title,
      slug: art.slug,
      content: art.content ?? null,
      isPremium: art.isPremium,
      createdAt: toIsoOrUndefined(art.createdAt),
      author: art.authorId ? { id: art.authorId } : undefined,
    };
    if (articleOverlay) {
      articleOverlay.openArticle(input, { source: 'feed' });
    } else {
      window.location.href = getArticleUrl(input);
    }
  };

  return (
    <div className="space-y-4 font-sans pb-12">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-4 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Rechercher une pensée, un profil ou une thématique...`}
            className="w-full! pl-11 pr-16 py-3 bg-card border border-border/60 rounded-2xl text-sm! text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all shadow-2xs leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
          />
          {hasQuery ? (
            <Button
              variant="ghost"
              shape="icon"
              onClick={() => setQuery('')}
              className="absolute right-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              title={t`Effacer`}
              aria-label={t`Effacer`}
            >
              <X className="w-4! h-4!" />
            </Button>
          ) : (
            <kbd className="absolute right-3 px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground bg-muted/60 border border-border/50 rounded-md">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Tabs Bar */}
      {hasQuery && (
        <div className="flex items-center gap-1 border-b border-border/40 pb-2 overflow-x-auto no-scrollbar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('all')}
            className={`rounded-xl px-3.5 py-1.5 text-xs! font-semibold! hover:bg-transparent ${
              activeTab === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block `}
          >
            {t`Tous les résultats`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('thoughts')}
            className={`items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs! font-semibold! hover:bg-transparent ${
              activeTab === 'thoughts'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } leading-[16px]! h-auto! whitespace-normal! justify-normal `}
          >
            <MessageSquare className="w-3.5! h-3.5!" />
            <span>{t`Pensées (${thoughtCountLabel})`}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('users')}
            className={`items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs! font-semibold! hover:bg-transparent ${
              activeTab === 'users'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } leading-[16px]! h-auto! whitespace-normal! justify-normal `}
          >
            <UserIcon className="w-3.5! h-3.5!" />
            <span>{t`Profils (${users.length})`}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('articles')}
            className={`items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs! font-semibold! hover:bg-transparent ${
              activeTab === 'articles'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } leading-[16px]! h-auto! whitespace-normal! justify-normal `}
          >
            <FileText className="w-3.5! h-3.5!" />
            <span>{t`Articles (${articleCountLabel})`}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('semantic')}
            className={`items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs! font-semibold! hover:bg-transparent ${
              activeTab === 'semantic'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } leading-[16px]! h-auto! whitespace-normal! justify-normal `}
            title={t`Classement par similarité de sens`}
          >
            <Sparkles className="w-3.5! h-3.5!" />
            <span>
              {semanticItems.length > 0 ? t`Sémantique (${semanticItems.length})` : t`Sémantique`}
            </span>
          </Button>
        </div>
      )}

      {/* State: Prompt if no query */}
      {!hasQuery && (
        <div className="py-16 text-center space-y-3 bg-card/30 border border-border/40 rounded-3xl p-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-bold text-base text-foreground">
            {t`Découvrez des conversations sur qoefi`}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t`Saisissez un mot-clé, un hashtag comme`}{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-semibold">#tech</code>{' '}
            {t`ou un identifiant d'auteur.`}
          </p>
        </div>
      )}

      {/* State: Loading */}
      {isLoading && hasQuery && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* State: Error */}
      {isError && hasQuery && !isLoading && (
        <div className="p-4 bg-destructive/10 text-destructive-text text-xs font-semibold rounded-2xl border border-destructive/20 text-center">
          {activeTab === 'semantic'
            ? t`Recherche sémantique indisponible pour le moment. La recherche par mots-clés reste accessible.`
            : t`Une erreur est survenue lors de la recherche.`}
        </div>
      )}

      {/* Results Rendering */}
      {!isLoading && hasQuery && !isError && (
        <div className="space-y-6">
          {/* Section Profils */}
          {(activeTab === 'all' || activeTab === 'users') && users.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                {t`Profils (${users.length})`}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {users.map((u) => (
                  <Link
                    key={u.id}
                    href={routes.feed.profile(u.slug || u.subdomain || u.id)}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50 hover:bg-muted/40 transition-colors group"
                  >
                    <AuthorAvatar user={u} size="md" showBadge={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                          {u.name || t`Auteur`}
                        </span>
                        {u.isCertified && <CertifiedBadge />}
                      </div>
                      <span className="text-[11px] text-muted-foreground block truncate">
                        @{u.slug || u.subdomain || u.id.slice(0, 8)}
                      </span>
                      {u.heroText && (
                        <p className="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">
                          {u.heroText}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section Pensées */}
          {(activeTab === 'all' || activeTab === 'thoughts') && (
            <div className="space-y-2">
              {thoughts.length > 0 && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {t`Pensées (${thoughts.length})`}
                </h3>
              )}
              {thoughts.length > 0 && (
                <div className="rounded-2xl border border-border/50 overflow-hidden divide-y divide-border/30 bg-card">
                  {thoughts.map((thought) => (
                    <ThoughtCard
                      key={thought.id}
                      post={thought}
                      onOpenPost={(id, authorUsername) => {
                        const handle =
                          authorUsername ||
                          thought.author?.username ||
                          thought.author?.subdomain ||
                          thought.author?.id ||
                          t`auteur`;
                        if (thoughtOverlay) {
                          thoughtOverlay.openThought(id, handle);
                        } else {
                          window.location.href = routes.feed.thought(handle, id);
                        }
                      }}
                      onOpenArticle={(art: QuotedArticleData) => {
                        if (!art?.slug) return;
                        const input: OpenArticleInput = {
                          slug: art.slug,
                          title: art.title,
                          imageUrl: art.imageUrl,
                          isPremium: art.isPremium,
                          author: art.author
                            ? {
                                id: '',
                                name: art.author.name,
                                username: art.author.username || undefined,
                                subdomain: art.author.subdomain,
                              }
                            : undefined,
                        };
                        if (articleOverlay) {
                          articleOverlay.openArticle(input, { source: 'feed' });
                        } else {
                          window.location.href = getArticleUrl({ slug: art.slug });
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'thoughts' && infiniteThoughts.hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => infiniteThoughts.fetchNextPage()}
                  loading={infiniteThoughts.isFetchingNextPage}
                  className="mx-auto mt-2 items-center gap-1.5 rounded-xl border-border/50 bg-card px-4 py-2 text-xs! font-semibold! text-foreground hover:bg-muted/40 leading-[16px]! h-auto! whitespace-normal! justify-normal "
                >
                  {!infiniteThoughts.isFetchingNextPage && (
                    <ChevronDown className="w-3.5! h-3.5!" />
                  )}
                  {t`Charger plus de pensées`}
                </Button>
              )}

              {activeTab === 'all' && base.data?.nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('thoughts')}
                  className="mx-auto mt-2 items-center gap-1.5 rounded-xl border-border/50 bg-card px-4 py-2 text-xs! font-semibold! text-foreground hover:bg-muted/40 leading-[16px]! h-auto! whitespace-normal! justify-normal "
                >
                  <MessageSquare className="w-3.5! h-3.5!" />
                  {t`Parcourir toutes les pensées`}
                </Button>
              )}
            </div>
          )}

          {/* Section Articles */}
          {(activeTab === 'all' || activeTab === 'articles') && (
            <div className="space-y-2">
              {articles.length > 0 && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {t`Articles (${articles.length})`}
                </h3>
              )}
              {articles.length > 0 && (
                <div className="grid gap-2">
                  {articles.map((art) => (
                    <Button
                      key={art.id}
                      variant="ghost"
                      block
                      onClick={() => openArticle(art)}
                      className="select-none flex-col items-start gap-0 space-y-1 rounded-2xl border border-border/50 bg-card p-4 text-left hover:border-border/80 hover:bg-muted/40 h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
                    >
                      <h4 className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                        {art.title}
                      </h4>
                      {art.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {art.content.slice(0, 140)}...
                        </p>
                      )}
                    </Button>
                  ))}
                </div>
              )}

              {activeTab === 'articles' &&
                articles.length === 0 &&
                infiniteArticles.hasNextPage && (
                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                    {t`Les résultats de cette page sont tous filtrés — continuez pour trouver des articles.`}
                  </p>
                )}

              {activeTab === 'articles' && infiniteArticles.hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => infiniteArticles.fetchNextPage()}
                  loading={infiniteArticles.isFetchingNextPage}
                  className="mx-auto mt-2 items-center gap-1.5 rounded-xl border-border/50 bg-card px-4 py-2 text-xs! font-semibold! text-foreground hover:bg-muted/40 leading-[16px]! h-auto! whitespace-normal! justify-normal "
                >
                  {!infiniteArticles.isFetchingNextPage && (
                    <ChevronDown className="w-3.5! h-3.5!" />
                  )}
                  {t`Charger plus d'articles`}
                </Button>
              )}

              {activeTab === 'all' && base.data?.articlesNextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('articles')}
                  className="mx-auto mt-2 items-center gap-1.5 rounded-xl border-border/50 bg-card px-4 py-2 text-xs! font-semibold! text-foreground hover:bg-muted/40 leading-[16px]! h-auto! whitespace-normal! justify-normal "
                >
                  <FileText className="w-3.5! h-3.5!" />
                  {t`Parcourir tous les articles`}
                </Button>
              )}
            </div>
          )}

          {/* Section Sémantique */}
          {activeTab === 'semantic' && semanticItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                {t`Proches par le sens (${semanticItems.length})`}
              </h3>
              <p className="px-1 text-[11px] text-muted-foreground">
                {t`Classement par similarité de sens, indépendamment des mots exacts.`}
              </p>
              <div className="grid gap-2">
                {semanticItems.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    block
                    onClick={() =>
                      openArticle({
                        id: item.id,
                        title: item.title,
                        slug: item.slug,
                        isPremium: item.isPremium,
                        createdAt: item.createdAt,
                        authorId: item.authorId,
                      })
                    }
                    className="flex-col items-start gap-0 space-y-1 rounded-2xl border border-border/50 bg-card p-4 text-left hover:border-border/80 hover:bg-muted/40 h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal "
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {Math.round(item.score * 100)} %
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {item.publisherName ? `${item.publisherName} · ` : ''}
                      {t`${item.readingTime} min`}
                      {item.isPremium ? t` · Premium` : ''}
                    </p>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* State: No Results — décidé par onglet, pas sur la somme */}
          {showNoResults && (
            <div className="py-12 text-center text-muted-foreground text-xs bg-card/30 rounded-2xl border border-border/30 p-6">
              {activeTab === 'semantic' ? (
                <>
                  {t`Aucun article proche par le sens pour`}{' '}
                  <strong className="text-foreground">"{query}"</strong>.
                </>
              ) : (
                <>
                  {t`Aucun résultat trouvé pour`}{' '}
                  <strong className="text-foreground">"{query}"</strong>.
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
