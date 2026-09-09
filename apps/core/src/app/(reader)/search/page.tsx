import React from 'react';
import { SearchFeed } from '@/components/social/SearchFeed';
import { TrendingWidget } from '@/components/social/TrendingWidget';

export const metadata = {
  title: 'Recherche & Tendances | qoe.fi',
  description: 'Explorez les pensées, les auteurs certifiés et les sujets tendances sur qoe.fi.',
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedParams = await searchParams;
  const initialQuery = resolvedParams?.q || '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Colonne Principale (Search Feed) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-border/40">
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Recherche
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Explorez les pensées, les auteurs certifiés et les tendances.
              </p>
            </div>
          </div>
          <SearchFeed initialQuery={initialQuery} />
        </div>

        {/* Colonne Latérale (Trending Widget) */}
        <div className="lg:col-span-4 space-y-6 hidden lg:block">
          <TrendingWidget />
        </div>
      </div>
    </div>
  );
}
