// =====================================================================
// 📥 highlight-queue.ts — File de surlignages LOCAUX + synchro différée
// =====================================================================
// Objectif : surligner un passage doit être INSTANTANÉ (zéro spinner,
// zéro attente réseau). Le surlignage est :
//   1. enregistré immédiatement en local (AsyncStorage) → survit au
//      redémarrage, fonctionne hors-ligne ;
//   2. affiché en optimiste (mark inline + liste) via le store réactif ;
//   3. synchronisé en ARRIÈRE-PLAN par `flushPendingHighlights` (à la
//      création, au démarrage, au retour d'app…).
// À la synchro, l'ID local est remplacé par l'ID serveur et la version
// serveur (ancres autoritaires) est injectée dans le cache react-query
// SANS refetch (pas de flicker du <mark>).
// =====================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';

import { apiClient } from '@/lib/api';
import { type PendingHighlightCreate, makeLocalId } from '@/lib/highlight-queue-core';
import { queryClient } from '@/lib/query-client';
import type { Highlight } from '@qoe/sdk/mobile';

const STORAGE_KEY = '@qoe/highlight-queue/v1';

// ─── Store réactif (compatible useSyncExternalStore) ────────────────

let cache: PendingHighlightCreate[] | null = null;
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

/** Charge la file depuis AsyncStorage (une seule fois, puis en mémoire). */
async function ensureLoaded(): Promise<PendingHighlightCreate[]> {
  if (loaded && cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as PendingHighlightCreate[]) : [];
  } catch {
    cache = [];
  }
  loaded = true;
  notify();
  return cache;
}

/** Charge la file (au démarrage) — réveille le store réactif. */
export function loadPendingHighlights(): Promise<void> {
  return ensureLoaded().then(() => undefined);
}

function persist(next: PendingHighlightCreate[]): void {
  // Écriture fire-and-forget : même si le stockage échoue (plein), la
  // mémoire garde la file pour la session courante.
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
}

/**
 * Enregistre une création de surlignage EN LOCAL, instantanément, et
 * déclenche la synchro en arrière-plan. Résout l'entrée en attente créée.
 */
export async function enqueueHighlightCreate(
  input: Omit<PendingHighlightCreate, 'localId' | 'createdAt' | 'note'> & { note?: string | null }
): Promise<PendingHighlightCreate> {
  const list = await ensureLoaded();
  const item: PendingHighlightCreate = {
    ...input,
    note: input.note ?? null,
    localId: makeLocalId(),
    createdAt: new Date().toISOString(),
  };
  const next = [...list, item];
  cache = next;
  notify();
  persist(next);
  return item;
}

/** Retire une création en attente (après synchro réussie, ou annulation). */
export async function removePendingHighlight(localId: string): Promise<void> {
  const list = await ensureLoaded();
  const next = list.filter((p) => p.localId !== localId);
  if (next.length === list.length) return;
  cache = next;
  notify();
  persist(next);
}

/** Met à jour la note d'une création en attente (annotation optimiste). */
export async function updatePendingHighlightNote(
  localId: string,
  note: string | null
): Promise<void> {
  const list = await ensureLoaded();
  let changed = false;
  const next = list.map((p) => {
    if (p.localId !== localId) return p;
    changed = true;
    return { ...p, note };
  });
  if (!changed) return;
  cache = next;
  notify();
  persist(next);
}

/** Liste (synchrone) des créations en attente — pour les composants. */
export function getPendingHighlights(): PendingHighlightCreate[] {
  return cache ?? [];
}

/**
 * Hook : créations en attente d'un article, réactives (re-render à
 * chaque changement de file). Vide tant que la file n'est pas chargée.
 */
export function usePendingHighlightCreates(articleId: string): PendingHighlightCreate[] {
  useSyncExternalStore(subscribe, getVersion);
  const pending = getPendingHighlights();
  return useMemo(() => pending.filter((p) => p.articleId === articleId), [pending, articleId]);
}

// ─── Synchro différée (flush) ────────────────────────────────────────

let flushing: Promise<void> | null = null;

/**
 * Synchronise la file vers le serveur, en arrière-plan (single-flight :
 * les appels concurrents partagent la même passe).
 *
 * Pour chaque création : POST → succès ⇒ la version serveur remplace
 * l'optimiste dans le cache react-query (`setQueryData`, zéro refetch,
 * zéro flicker du <mark>) et l'entrée quitte la file persistée.
 * En cas d'échec (réseau, auth…), on s'arrête et on retentera au
 * prochain déclencheur — le surlignage reste visible + sauvegardé.
 */
export function flushPendingHighlights(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const list = await ensureLoaded();
    for (const pending of list) {
      const res = await apiClient.createHighlight(pending.articleId, {
        text: pending.text,
        note: pending.note,
        isPublic: pending.isPublic,
        quoteOrdinal: pending.quoteOrdinal,
      });
      if (!res.ok) {
        // Échec transitoire : on garde l'entrée et on s'arrête.
        break;
      }
      // 1. Cache : remplace l'optimiste par la version serveur (sans flicker).
      queryClient.setQueryData<Highlight[]>(['highlights', pending.articleId], (old) => {
        const base = (old ?? []).filter(
          (h) => h.id !== pending.localId && (h as { localId?: string }).localId !== pending.localId
        );
        return [...base, res.data];
      });
      // 2. File : retire l'entrée persistée (le rendu optimiste disparaît
      //    en même temps que la version serveur entre en cache).
      await removePendingHighlight(pending.localId);
      // 3. Rafraîchissements d'arrière-plan (bibliothèque…).
      void queryClient.invalidateQueries({ queryKey: ['library', 'highlights'] });
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
