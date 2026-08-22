'use client';

import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

  const totalCount = items.length + (hasNextPage ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Trigger fetchNextPage when scrolling near the last item
  useEffect(() => {
    if (lastVirtualIndex < 0) return;
    if (
      lastVirtualIndex >= items.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage &&
      fetchNextPage
    ) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div
      ref={parentRef}
      className="w-full overflow-y-auto max-h-[calc(100vh-8rem)] scrollbar-thin space-y-4 pr-1"
    >
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
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {isLoaderRow ? <ThoughtCardSkeleton /> : renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
