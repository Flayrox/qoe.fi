'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import {
  hasResultsForTab,
  mergeArticlePages,
  mergeThoughtPages,
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
    !(activeTab === 'thoughts' && infiniteThoughts.hasNextPage);

  const openArticle = (art: OpenedArticle) => {
    if (!art.slug) return;
    const input: OpenArticleInput = {
      id: art.id,
      title: art.title,
      slug: art.slug,
      content: art.content ?? null,
      isPremium: art.isPremium,
      createdAt: art.createdAt === undefined ? undefined : new Date(art.createdAt).toISOString(),
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
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une pensée, un profil ou une thématique..."
            className="w-full pl-11 pr-16 py-3 bg-card border border-border/60 rounded-2xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all shadow-2xs"
          />
          {hasQuery ? (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Effacer"
            >
              <X className="w-4 h-4" />
            </button>
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
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Tous les résultats
          </button>
          <button
            onClick={() => setActiveTab('thoughts')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'thoughts'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Pensées ({thoughtCountLabel})</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profils ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('articles')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'articles'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Articles ({articleCountLabel})</span>
          </button>
          <button
            onClick={() => setActiveTab('semantic')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'semantic'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Classement par similarité de sens"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sémantique{semanticItems.length > 0 ? ` (${semanticItems.length})` : ''}</span>
          </button>
        </div>
      )}

      {/* State: Prompt if no query */}
      {!hasQuery && (
        <div className="py-16 text-center space-y-3 bg-card/30 border border-border/40 rounded-3xl p-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-bold text-base text-foreground">
            Découvrez des conversations sur qoefi
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Saisissez un mot-clé, un hashtag comme{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-semibold">#tech</code>{' '}
            ou un identifiant d'auteur.
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
            ? 'Recherche sémantique indisponible pour le moment. La recherche par mots-clés reste accessible.'
            : 'Une erreur est survenue lors de la recherche.'}
        </div>
      )}

      {/* Results Rendering */}
      {!isLoading && hasQuery && !isError && (
        <div className="space-y-6">
          {/* Section Profils */}
          {(activeTab === 'all' || activeTab === 'users') && users.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                Profils ({users.length})
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
                          {u.name || 'Auteur'}
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
                  Pensées ({thoughts.length})
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
                          'auteur';
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
                <button
                  type="button"
                  onClick={() => infiniteThoughts.fetchNextPage()}
                  disabled={infiniteThoughts.isFetchingNextPage}
                  className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 disabled:opacity-60"
                >
                  {infiniteThoughts.isFetchingNextPage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Charger plus de pensées
                </button>
              )}

              {activeTab === 'all' && base.data?.nextCursor && (
                <button
                  type="button"
                  onClick={() => setActiveTab('thoughts')}
                  className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Parcourir toutes les pensées
                </button>
              )}
            </div>
          )}

          {/* Section Articles */}
          {(activeTab === 'all' || activeTab === 'articles') && (
            <div className="space-y-2">
              {articles.length > 0 && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                  Articles ({articles.length})
                </h3>
              )}
              {articles.length > 0 && (
                <div className="grid gap-2">
                  {articles.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => openArticle(art)}
                      className="p-4 rounded-2xl bg-card border border-border/50 space-y-1 text-left hover:border-border/80 hover:bg-muted/40 transition-all cursor-pointer select-none"
                    >
                      <h4 className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                        {art.title}
                      </h4>
                      {art.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {art.content.slice(0, 140)}...
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'articles' &&
                articles.length === 0 &&
                infiniteArticles.hasNextPage && (
                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                    Les résultats de cette page sont tous filtrés — continuez pour trouver des
                    articles.
                  </p>
                )}

              {activeTab === 'articles' && infiniteArticles.hasNextPage && (
                <button
                  type="button"
                  onClick={() => infiniteArticles.fetchNextPage()}
                  disabled={infiniteArticles.isFetchingNextPage}
                  className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 disabled:opacity-60"
                >
                  {infiniteArticles.isFetchingNextPage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Charger plus d'articles
                </button>
              )}

              {activeTab === 'all' && base.data?.articlesNextCursor && (
                <button
                  type="button"
                  onClick={() => setActiveTab('articles')}
                  className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Parcourir tous les articles
                </button>
              )}
            </div>
          )}

          {/* Section Sémantique */}
          {activeTab === 'semantic' && semanticItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                Proches par le sens ({semanticItems.length})
              </h3>
              <p className="px-1 text-[11px] text-muted-foreground">
                Classement par similarité de sens, indépendamment des mots exacts.
              </p>
              <div className="grid gap-2">
                {semanticItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
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
                    className="space-y-1 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-border/80 hover:bg-muted/40"
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
                      {item.readingTime} min
                      {item.isPremium ? ' · Premium' : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* State: No Results — décidé par onglet, pas sur la somme */}
          {showNoResults && (
            <div className="py-12 text-center text-muted-foreground text-xs bg-card/30 rounded-2xl border border-border/30 p-6">
              {activeTab === 'semantic' ? (
                <>
                  Aucun article proche par le sens pour{' '}
                  <strong className="text-foreground">"{query}"</strong>.
                </>
              ) : (
                <>
                  Aucun résultat trouvé pour <strong className="text-foreground">"{query}"</strong>.
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
