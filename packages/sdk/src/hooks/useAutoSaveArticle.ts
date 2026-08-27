// =====================================================================
// 💾 useAutoSaveArticle — Auto-save debouncé pour l'éditeur d'articles
// =====================================================================
// Machine à états simple (idle → unsaved → saving → saved / error) avec :
// - debounce (défaut 2s) avant chaque sauvegarde ;
// - sérialisation : si une sauvegarde est en cours, la suivante est
//   « pending » et rejouée dès la fin (pas de chevauchement de requêtes) ;
// - `saveNow` pour les sauvegardes explicites (bouton, raccourci).
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
  isPremium?: boolean;
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

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestPayloadRef = useRef<AutoSavePayload | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<boolean>(false);

  const triggerSave = useCallback(
    async (payload: AutoSavePayload) => {
      if (isSavingRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      if (!payload.title.trim()) return;

      try {
        isSavingRef.current = true;
        pendingSaveRef.current = false;
        setStatus('saving');
        setErrorMessage(null);

        const result = await onSave({
          ...payload,
          id: payload.id || articleId,
        });

        if (result.id) {
          setArticleId(result.id);
        }

        const savedDate = result.updatedAt ? new Date(result.updatedAt) : new Date();
        setLastSavedAt(savedDate);
        setStatus('saved');
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error('Auto-save failed');
        setErrorMessage(error.message);
        setStatus('error');
        onError?.(error);
      } finally {
        isSavingRef.current = false;
        if (pendingSaveRef.current && latestPayloadRef.current) {
          pendingSaveRef.current = false;
          triggerSave(latestPayloadRef.current);
        }
      }
    },
    [articleId, onSave, onError]
  );

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
          triggerSave(latestPayloadRef.current);
        }
      }, delay);
    },
    [delay, enabled, triggerSave]
  );

  // Au démontage (navigation, fermeture de l'onglet), on flushe le debounce
  // en cours pour ne pas perdre les dernières frappes (triggerSave ignore
  // les titres vides ; isSavingRef évite de chevaucher une sauvegarde).
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        if (latestPayloadRef.current && !isSavingRef.current) {
          triggerSave(latestPayloadRef.current);
        }
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
      // Le replay de la file (pending) lit latestPayloadRef : une sauvegarde
      // explicite pendant qu'une autre est en vol doit aussi être rejouée.
      latestPayloadRef.current = payload;
      return triggerSave(payload);
    },
  };
}
