'use client';

// =====================================================================
// TenantSearchClient.tsx — Recherche d'une publication (résultats serveur)
// =====================================================================
// Le filtrage est fait dans la page serveur (`filterTenantArticles`). Ce
// composant ne fait que piloter `?q=` et `?category=` : le navigateur ne
// reçoit plus l'intégralité des articles pour les filtrer localement.
// =====================================================================

import React, { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X, Clock, Calendar, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { plural, t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, InputGroup } from '@qoe/ui/input';
import { SafeImage } from '@qoe/ui';
import { buildArticlePath } from '@qoe/utils';

export interface SearchArticleItem {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  categoryName?: string | null;
  categorySlug?: string | null;
  readingTime?: number;
  publishedAt?: string;
  imageUrl?: string | null;
  isPremium?: boolean;
}

export interface TenantSearchClientProps {
  initialQuery?: string;
  initialCategory?: string;
  articles: SearchArticleItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
  accentColor?: string | null;
}

export function TenantSearchClient({
  initialQuery = '',
  initialCategory = 'all',
  articles = [],
  categories = [],
}: TenantSearchClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [isPending, startTransition] = useTransition();
  const previousServerQuery = useRef(initialQuery);

  // Les résultats viennent du serveur : on resynchronise l'état local quand
  // une navigation (retour arrière, lien partagé) change les props. On ne
  // remplace la requête que si l'utilisateur n'a pas continué à taper entre
  // l'envoi et la réponse — sinon une réponse lente écraserait sa frappe.
  useEffect(() => {
    const previous = previousServerQuery.current;
    previousServerQuery.current = initialQuery;
    setQuery((current) => (current === previous ? initialQuery : current));
  }, [initialQuery]);
  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  // Debounce : la frappe met à jour l'URL, le serveur refiltre et renvoie
  // uniquement les articles retenus.
  useEffect(() => {
    const nextQuery = query.trim();
    const nextCategory = selectedCategory || 'all';
    if (nextQuery === initialQuery.trim() && nextCategory === initialCategory) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (nextQuery) params.set('q', nextQuery);
      if (nextCategory !== 'all') params.set('category', nextCategory);
      const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;

      startTransition(() => {
        router.replace(target, { scroll: false });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedCategory, initialQuery, initialCategory, pathname, router]);

  const results = articles;
  const count = results.length;
  const searchTerm = query.trim();
  const hasSearch = searchTerm.length > 0;
  const hasFilters = hasSearch || selectedCategory !== 'all';

  const reset = () => {
    setQuery('');
    setSelectedCategory('all');
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-4 sm:py-8">
      {/* Barre de Recherche Principale */}
      <div className="relative mb-6">
        <InputGroup
          size="lg"
          left={<Search />}
          right={
            hasSearch ? (
              <Button
                variant="ghost"
                size="xs"
                shape="icon"
                onClick={() => setQuery('')}
                title={t`Effacer`}
                aria-label={t`Effacer la recherche`}
              >
                <X />
              </Button>
            ) : isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin opacity-60" />
            ) : undefined
          }
          className="bg-card shadow-xs"
        >
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Rechercher par titre, mot-clé, sujet...`}
            autoFocus
            aria-label={t`Rechercher dans la publication`}
          />
        </InputGroup>
      </div>

      {/* Filtres par Rubrique */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none select-none">
          <Button
            variant={selectedCategory === 'all' ? 'solid' : 'outline'}
            tone="neutral"
            size="xs"
            onClick={() => setSelectedCategory('all')}
            className="rounded-full shrink-0"
          >
            {t`Tous les articles`}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.slug ? 'solid' : 'outline'}
              tone="neutral"
              size="xs"
              onClick={() => setSelectedCategory(cat.slug)}
              className="rounded-full shrink-0"
            >
              {cat.name}
            </Button>
          ))}
        </div>
      )}

      {/* Résumé du nombre de résultats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
        <span aria-live="polite">
          {hasSearch
            ? t`${plural(count, { one: '# résultat trouvé', other: '# résultats trouvés' })}`
            : t`${plural(count, { one: '# publication disponible', other: '# publications disponibles' })}`}
        </span>
        {hasFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={reset}
            className="h-auto px-1 py-0 text-xs underline underline-offset-4"
          >
            {t`Réinitialiser`}
          </Button>
        )}
      </div>

      {/* Liste des Résultats */}
      {results.length > 0 ? (
        <div
          className={`space-y-3 sm:space-y-4 transition-opacity ${isPending ? 'opacity-60' : ''}`}
        >
          {results.map((art) => (
            <Link
              key={art.id}
              href={buildArticlePath(art)}
              className="group block p-4 sm:p-5 rounded-2xl border border-border/50 hover:border-foreground/30 bg-card/60 hover:bg-card transition-all shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 flex-wrap">
                    {art.categoryName && (
                      <Badge variant="soft" tone="neutral" shape="pill" size="xs">
                        {art.categoryName}
                      </Badge>
                    )}
                    {art.publishedAt && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 opacity-60" />
                        <time dateTime={art.publishedAt}>
                          {new Date(art.publishedAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </time>
                      </span>
                    )}
                    {art.readingTime && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span>{art.readingTime} min</span>
                      </span>
                    )}
                    <span>·</span>
                    <span className="uppercase font-semibold tracking-wider text-[10px]">
                      {art.isPremium ? t`Payant` : t`Gratuit`}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors leading-snug">
                    {art.title}
                  </h3>

                  {art.excerpt && (
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed font-normal">
                      {art.excerpt}
                    </p>
                  )}
                </div>

                {art.imageUrl && (
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-border/40 shrink-0 bg-muted/30">
                    <SafeImage
                      src={art.imageUrl}
                      alt={art.title}
                      fill
                      sizes="96px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* État Vide */
        <div className="p-8 sm:p-12 text-center rounded-2xl border border-dashed border-border/60 bg-muted/10 my-6">
          <Sparkles className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
          <h4 className="text-base font-bold text-foreground mb-1">
            {hasSearch
              ? t`Aucun article ne correspond à « ${searchTerm} »`
              : t`Aucun article dans cette rubrique`}
          </h4>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto mb-4">
            {t`Essayez avec d'autres mots-clés ou consultez l'ensemble de nos publications.`}
          </p>
          <Button variant="solid" tone="brand" size="sm" onClick={reset}>
            <span>{t`Afficher tous les articles`}</span>
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
