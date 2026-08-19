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
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Colonne Principale (Search Feed) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="pb-2 border-b border-border/40 flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground tracking-tight">Recherche</h1>
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
