'use client';

import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ThoughtCardSkeleton } from '../social/ThoughtCardSkeleton';

export interface VirtualizedFeedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  estimateSize?: number;
  overscan?: number;
  keyExtractor?: (item: T, index: number) => string;
}

export function VirtualizedFeedList<T>({
  items,
  renderItem,
  fetchNextPage,
  hasNextPage = false,
  isFetchingNextPage = false,
  estimateSize = 180,
  overscan = 5,
  keyExtractor,
}: VirtualizedFeedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // `useLayoutEffect` côté client seulement : au rendu serveur il n'y a rien à
  // mesurer et React avertirait.
  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  const [scrollMargin, setScrollMargin] = useState(0);

  // Le parent n'existe pas encore au premier rendu : lire
  // `parentRef.current?.offsetTop` pendant le rendu donnait donc toujours `0`,
  // sans jamais re-mesurer. Le virtualizer plaçait alors les lignes comme si
  // la liste commençait en haut de la fenêtre (recouvrement de l'en-tête,
  // total de scroll faux). On mesure après montage, et quand le nombre de
  // lignes change (bannière, en-tête qui apparaît au-dessus).
  useIsomorphicLayoutEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    const measure = () => setScrollMargin(element.offsetTop);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [items.length]);

  // Le document gère le scroll global
  const totalCount = items.length + (hasNextPage ? 1 : 0);

  const rowVirtualizer = useWindowVirtualizer({
    count: totalCount,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Déclenchement de fetchNextPage UNIQUEMENT quand l'utilisateur approche du bas
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // Sans `IntersectionObserver` (WebView ancienne, environnement de test), le
    // chargement automatique est simplement désactivé : le fil reste lisible au
    // lieu de jeter au montage et de faire tomber la page entière.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={parentRef} className="w-full space-y-4 pr-1">
      <div
        className="w-full relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const isLoaderRow = virtualRow.index >= items.length;
          const item = items[virtualRow.index];
          const key = isLoaderRow
            ? `loader-${virtualRow.index}`
            : keyExtractor
              ? keyExtractor(item, virtualRow.index)
              : (item as { id?: string })?.id || virtualRow.index;

          return (
            <div
              key={key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-4"
              style={{
                transform: `translateY(${virtualRow.start - (rowVirtualizer.options.scrollMargin ?? 0)}px)`,
              }}
            >
              {isLoaderRow ? <ThoughtCardSkeleton /> : renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
      {/* Sentinelle en bas de liste pour déclencher le chargement uniquement au scroll réel */}
      {hasNextPage && <div ref={sentinelRef} className="h-8 w-full" />}
    </div>
  );
}
