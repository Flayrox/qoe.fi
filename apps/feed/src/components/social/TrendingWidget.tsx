'use client';

import React from 'react';
import Link from 'next/link';
import { TrendingUp, Hash, Loader2 } from 'lucide-react';
import { useTrendingQuery } from '@qoe/api-client';

export function TrendingWidget() {
  const { data: trends, isLoading, isError } = useTrendingQuery(6);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md p-4 space-y-3 font-sans shadow-xs">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground pb-1 border-b border-border/40">
        <TrendingUp className="w-4 h-4 text-primary shrink-0" />
        <span>Tendances actuelles</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          Impossible de charger les tendances.
        </p>
      )}

      {!isLoading && (!trends || trends.length === 0) && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          Aucune tendance pour le moment.
        </p>
      )}

      {!isLoading && trends && trends.length > 0 && (
        <div className="space-y-2">
          {trends.map((item) => (
            <Link
              key={item.id || item.hashtag}
              href={`/search?q=${encodeURIComponent('#' + item.hashtag)}`}
              className="group flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Hash className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                    #{item.hashtag}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.count} publication{item.count > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
