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
}

export interface UseAutoSaveArticleOptions {
  delay?: number;
  enabled?: boolean;
  onSave: (payload: AutoSavePayload) => Promise<{ id: string; updatedAt?: Date | string }>;
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

  const triggerSave = useCallback(
    async (payload: AutoSavePayload) => {
      if (isSavingRef.current || !payload.title.trim()) return;

      try {
        isSavingRef.current = true;
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
        if (latestPayloadRef.current) {
          triggerSave(latestPayloadRef.current);
        }
      }, delay);
    },
    [delay, enabled, triggerSave]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSavedAt,
    articleId,
    errorMessage,
    scheduleAutoSave,
    saveNow: (payload: AutoSavePayload) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return triggerSave(payload);
    },
  };
}
