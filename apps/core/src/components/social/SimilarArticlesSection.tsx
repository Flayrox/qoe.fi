'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Clock } from 'lucide-react';
import { getSimilarArticlesAction } from '@qoe/api-client/actions/articles';
import type { SimilarArticle } from '@qoe/api-client';

interface SimilarArticlesSectionProps {
  articleId: string;
}

/**
 * 🧠 « À lire aussi » — recommandations sémantiques (pgvector).
 * Appelle l'API Go `/v1/articles/{id}/similar`. Ne rend rien si le worker
 * d'embedding n'a pas encore indexé (liste vide) ou si l'API est indisponible.
 */
export function SimilarArticlesSection({ articleId }: SimilarArticlesSectionProps) {
  const [items, setItems] = useState<SimilarArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSimilarArticlesAction({ articleId })
      .then((res) => {
        if (!cancelled && res.ok && res.data) setItems(res.data);
      })
      .catch(() => {
        // Silencieux : la section est un bonus, pas un blocant.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loading || items.length === 0) return null;

  return (
    <section className="mt-10 pt-8 border-t border-border/40" aria-label="À lire aussi">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
        <Sparkles className="w-4 h-4 text-highlight" />À lire aussi
        <span className="text-[10px] font-medium text-muted-foreground normal-case">
          recommandé par IA
        </span>
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/article/${encodeURIComponent(item.slug)}`}
            className="block group"
          >
            <article className="rounded-xl border border-border/50 bg-card/60 hover:border-primary/40 hover:bg-card transition-all p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary line-clamp-2 leading-snug">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                <span className="truncate">
                  {item.publicationName || item.authorName || 'qoe.fi'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.readingTime} min
                </span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
