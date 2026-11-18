'use client';

// =====================================================================
// ⚡ Cache feed — primitives d'optimisme partagées
// =====================================================================
// Un seul parcours des structures de feed (infinite query `.pages[].data[]`
// ou tableau plat) pour tous les toggles (like, repost, signet).
// Avant : trois copies du même `setQueriesData`, donc trois endroits où
// oublier un alias de compteur (`likeCount` vs `likesCount`).
// =====================================================================

import type { QueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';

export type CacheEntity = Record<string, unknown>;

/** Applique `apply` à l'entité `id` dans une page de feed, sans muter l'entrée. */
function mapPage(page: unknown, id: string, apply: (entity: CacheEntity) => CacheEntity): unknown {
  if (!page || typeof page !== 'object') return page;
  const pageObj = page as Record<string, unknown>;
  if (!Array.isArray(pageObj.data)) return page;
  return {
    ...pageObj,
    data: pageObj.data.map((entity: unknown) => {
      if (!entity || typeof entity !== 'object') return entity;
      const record = entity as CacheEntity;
      return record.id === id ? apply(record) : entity;
    }),
  };
}

/**
 * Transforme la donnée d'un cache (infinite query ou tableau plat) en
 * appliquant `apply` à l'entité `id`. Toute autre forme est rendue telle quelle.
 */
export function mapFeedEntities(
  oldData: unknown,
  id: string,
  apply: (entity: CacheEntity) => CacheEntity
): unknown {
  if (!oldData || typeof oldData !== 'object') return oldData;
  const dataObj = oldData as Record<string, unknown>;
  if (Array.isArray(dataObj.pages)) {
    return {
      ...dataObj,
      pages: dataObj.pages.map((page: unknown) => mapPage(page, id, apply)),
    };
  }
  if (Array.isArray(oldData)) {
    return oldData.map((entity: unknown) => {
      if (!entity || typeof entity !== 'object') return entity;
      const record = entity as CacheEntity;
      return record.id === id ? apply(record) : entity;
    });
  }
  return oldData;
}

/** Applique `apply` à toutes les familles de feed en cache. */
export function patchFeedEntities(
  queryClient: QueryClient,
  id: string,
  apply: (entity: CacheEntity) => CacheEntity
): void {
  queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) =>
    mapFeedEntities(oldData, id, apply)
  );
}

/** Snapshot de toutes les familles de feed, pour un rollback exact. */
export function snapshotFeeds(queryClient: QueryClient): Array<[readonly unknown[], unknown]> {
  return queryClient.getQueriesData({ queryKey: feedKeys.all });
}

/** Restaure un snapshot produit par `snapshotFeeds`. */
export function restoreFeeds(
  queryClient: QueryClient,
  snapshot: Array<[readonly unknown[], unknown]> | undefined
): void {
  snapshot?.forEach(([key, data]) => {
    queryClient.setQueryData(key, data);
  });
}

/**
 * Compteur borné : lit l'alias disponible (`likeCount` **et** `likesCount`
 * coexistent selon les surfaces) et ne descend jamais sous zéro.
 */
export function nextCount(record: CacheEntity, keys: readonly string[], delta: 1 | -1): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value + delta);
    }
  }
  return delta === 1 ? 1 : 0;
}
