'use client';

// =====================================================================
// TenantSearchClient.tsx — Recherche Instantanée & Réactive (Tenant)
// =====================================================================

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, Clock, Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@qoe/utils';

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
  articles: SearchArticleItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
  accentColor?: string | null;
}

export function TenantSearchClient({
  initialQuery = '',
  articles = [],
  categories = [],
}: TenantSearchClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const words = trimmed.split(/\s+/).filter(Boolean);

    return articles.filter((art) => {
      // Filtre catégorie
      if (selectedCategory !== 'all' && art.categorySlug !== selectedCategory) {
        return false;
      }

      if (words.length === 0) return true;

      const titleLower = (art.title || '').toLowerCase();
      const excerptLower = (art.excerpt || '').toLowerCase();
      const catLower = (art.categoryName || '').toLowerCase();

      return words.every(
        (word) =>
          titleLower.includes(word) || excerptLower.includes(word) || catLower.includes(word)
      );
    });
  }, [articles, query, selectedCategory]);

  const hasSearch = query.trim().length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto py-4 sm:py-8">
      {/* Barre de Recherche Principale */}
      <div className="relative mb-6">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par titre, mot-clé, sujet..."
            autoFocus
            className="w-full pl-12 pr-11 py-3.5 sm:py-4 rounded-2xl bg-card border border-border/60 text-foreground text-base sm:text-lg placeholder:text-muted-foreground outline-none shadow-xs transition-all focus:border-[var(--tenant-accent,#C04328)] focus:ring-2 focus:ring-[var(--tenant-accent,#C04328)]/20"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3.5 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
              title="Effacer"
              aria-label="Effacer la recherche"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filtres par Rubrique */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none select-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer border',
              selectedCategory === 'all'
                ? 'bg-foreground text-background border-foreground shadow-2xs'
                : 'bg-card text-muted-foreground hover:text-foreground border-border/60 hover:border-foreground/30'
            )}
          >
            Tous les articles
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.slug)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer border',
                selectedCategory === cat.slug
                  ? 'bg-foreground text-background border-foreground shadow-2xs'
                  : 'bg-card text-muted-foreground hover:text-foreground border-border/60 hover:border-foreground/30'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Résumé du nombre de résultats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
        <span>
          {hasSearch
            ? `${filteredResults.length} résultat${filteredResults.length > 1 ? 's' : ''} trouvé${filteredResults.length > 1 ? 's' : ''}`
            : `${filteredResults.length} publication${filteredResults.length > 1 ? 's' : ''} disponible${filteredResults.length > 1 ? 's' : ''}`}
        </span>
        {hasSearch && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedCategory('all');
            }}
            className="hover:text-foreground transition-colors underline underline-offset-4"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Liste des Résultats */}
      {filteredResults.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          {filteredResults.map((art) => (
            <Link
              key={art.id}
              href={`/article/${art.slug}`}
              className="group block p-4 sm:p-5 rounded-2xl border border-border/50 hover:border-foreground/30 bg-card/60 hover:bg-card transition-all shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 flex-wrap">
                    {art.categoryName && (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-muted text-foreground text-[10px] uppercase tracking-wider">
                        {art.categoryName}
                      </span>
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
                      {art.isPremium ? 'PAYANT' : 'GRATUIT'}
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
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-border/40 shrink-0 bg-muted/30">
                    <img
                      src={art.imageUrl}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
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
              ? `Aucun article ne correspond à « ${query} »`
              : 'Aucun article dans cette rubrique'}
          </h4>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto mb-4">
            Essayez avec d&apos;autres mots-clés ou consultez l&apos;ensemble de nos publications.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedCategory('all');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <span>Afficher tous les articles</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
