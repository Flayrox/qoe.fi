'use client';

// =====================================================================
// 💾 useAutoSaveArticle — Auto-save debouncé pour l'éditeur d'articles
// =====================================================================
// Machine à états simple (idle → unsaved → saving → saved / error) avec :
// - debounce (défaut 2s) avant chaque sauvegarde ;
// - sérialisation : si une sauvegarde est en cours, la suivante est
//   « pending » et rejouée dès la fin (pas de chevauchement de requêtes) ;
// - déduplication : un payload identique à la dernière sauvegarde réussie
//   n'est jamais renvoyé au serveur ;
// - `saveNow` pour les sauvegardes explicites (bouton, raccourci).
//
// ⚠️ Robustesse aux identités instables : `onSave` est presque toujours une
// closure inline recréée à chaque rendu. On la lit via une ref pour que
// `triggerSave` / `scheduleAutoSave` gardent une identité stable — sinon
// l'effet de flush (démontage) se rejouait à chaque rendu et court-circuitait
// le debounce, provoquant des PATCH en boucle.
// ⚠️ Spécifique au dashboard web (éditeur Tiptap) — pas utilisé par le mobile.
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

export type AutoSaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface AutoSavePayload {
  id?: string;
  title: string;
  content: string;
  slug?: string;
  published?: boolean;
  status?: string;
  scheduledAt?: string | null;
  isPremium?: boolean;
  imageUrl?: string | null;
  allowPublicAnnotations?: boolean;
  allowComments?: boolean;
  allowDownload?: boolean;
  categoryId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  attributions?: Array<{
    userId: string;
    role?: string;
    order?: number;
    isVisible?: boolean;
  }>;
}

export interface UseAutoSaveArticleOptions {
  delay?: number;
  enabled?: boolean;
  onSave: (payload: AutoSavePayload) => Promise<{ id?: string; updatedAt?: Date | string }>;
  onError?: (error: Error) => void;
}

/** Empreinte stable du payload : sert uniquement à éviter les requêtes inutiles. */
function payloadSignature(payload: AutoSavePayload): string {
  return JSON.stringify({
    t: payload.title ?? '',
    c: payload.content ?? '',
    s: payload.slug ?? '',
    pub: payload.published ?? null,
    st: payload.status ?? null,
    sch: payload.scheduledAt ?? null,
    prem: payload.isPremium ?? null,
    img: payload.imageUrl ?? null,
    cat: payload.categoryId ?? null,
    stitle: payload.seoTitle ?? null,
    sdesc: payload.seoDescription ?? null,
    comm: payload.allowComments ?? null,
    ann: payload.allowPublicAnnotations ?? null,
    dl: payload.allowDownload ?? null,
    attr: (payload.attributions ?? []).map((a) => ({
      u: a.userId,
      r: a.role ?? null,
      o: a.order ?? null,
      v: a.isVisible ?? null,
    })),
  });
}

export function useAutoSaveArticle({
  delay = 2000,
  enabled = true,
  onSave,
  onError,
}: UseAutoSaveArticleOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [articleId, setArticleId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<AutoSavePayload | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<boolean>(false);
  const articleIdRef = useRef<string | undefined>(undefined);
  const savedSignatureRef = useRef<string | null>(null);

  // Refs toujours à jour, mais identité figée pour les callbacks ci-dessous.
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSaveRef.current = onSave;
    onErrorRef.current = onError;
  });

  const triggerSave = useCallback(async (payload: AutoSavePayload) => {
    if (!payload.title.trim()) return;

    if (isSavingRef.current) {
      latestPayloadRef.current = payload;
      pendingSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;

    try {
      let current: AutoSavePayload | null = payload;

      // Boucle sérialisée : on enchaîne les payloads arrivés pendant un vol,
      // sans jamais lancer deux requêtes en parallèle.
      while (current) {
        const signature = payloadSignature(current);
        latestPayloadRef.current = null;
        pendingSaveRef.current = false;

        if (signature === savedSignatureRef.current) {
          // Rien n'a changé depuis la dernière sauvegarde réussie.
          setStatus('saved');
        } else {
          setStatus('saving');
          setErrorMessage(null);

          const result = await onSaveRef.current({
            ...current,
            id: current.id || articleIdRef.current,
          });

          if (result?.id) {
            articleIdRef.current = result.id;
            setArticleId(result.id);
          }
          savedSignatureRef.current = signature;
          setLastSavedAt(result?.updatedAt ? new Date(result.updatedAt) : new Date());
          setStatus('saved');
        }

        current = pendingSaveRef.current ? latestPayloadRef.current : null;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Auto-save failed');
      setErrorMessage(error.message);
      setStatus('error');
      onErrorRef.current?.(error);
    } finally {
      isSavingRef.current = false;
      pendingSaveRef.current = false;
    }
  }, []);

  const scheduleAutoSave = useCallback(
    (payload: AutoSavePayload) => {
      if (!enabled) return;

      latestPayloadRef.current = payload;
      setStatus('unsaved');

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (latestPayloadRef.current) {
          void triggerSave(latestPayloadRef.current);
        }
      }, delay);
    },
    [delay, enabled, triggerSave]
  );

  // Au démontage (navigation, fermeture de l'onglet), on flushe le debounce
  // en cours pour ne pas perdre les dernières frappes. `triggerSave` est
  // stable : cet effet ne tourne donc qu'une fois, au vrai démontage.
  useEffect(() => {
    return () => {
      const timeout = timeoutRef.current;
      if (!timeout) return;
      clearTimeout(timeout);
      timeoutRef.current = null;
      if (latestPayloadRef.current && !isSavingRef.current) {
        void triggerSave(latestPayloadRef.current);
      }
    };
  }, [triggerSave]);

  return {
    status,
    lastSavedAt,
    articleId,
    errorMessage,
    scheduleAutoSave,
    saveNow: (payload: AutoSavePayload) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      latestPayloadRef.current = payload;
      return triggerSave(payload);
    },
  };
}
