'use client';

import React, { useRef, useEffect } from 'react';
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

  // Le document gère le scroll global
  const totalCount = items.length + (hasNextPage ? 1 : 0);

  const rowVirtualizer = useWindowVirtualizer({
    count: totalCount,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Déclenchement de fetchNextPage UNIQUEMENT quand l'utilisateur approche du bas
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

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
