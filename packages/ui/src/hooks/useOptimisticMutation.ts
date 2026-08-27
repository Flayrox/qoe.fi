'use client';

// =====================================================================
// ⚡ useOptimisticMutation — Hook d'interactions UI à 60 FPS
// =====================================================================

import { useOptimistic, useTransition } from 'react';
import { toast } from '@qoe/ui/toast';
import type { ActionResult } from '@qoe/utils';

export interface UseOptimisticMutationOptions<TState, TArgs extends unknown[], TResult> {
  currentState: TState;
  updateFn: (state: TState, ...args: TArgs) => TState;
  action: (...args: TArgs) => Promise<ActionResult<TResult>>;
  onSuccess?: (result: TResult, ...args: TArgs) => void;
  onError?: (error: { code?: string; message: string }, ...args: TArgs) => void;
  errorMessage?: string;
}

export function useOptimisticMutation<TState, TArgs extends unknown[], TResult>({
  currentState,
  updateFn,
  action,
  onSuccess,
  onError,
  errorMessage = 'Une erreur est survenue.',
}: UseOptimisticMutationOptions<TState, TArgs, TResult>) {
  const [isPending, startTransition] = useTransition();

  const [optimisticState, setOptimisticState] = useOptimistic(
    currentState,
    (state: TState, args: TArgs) => updateFn(state, ...args)
  );

  const execute = (...args: TArgs) => {
    startTransition(async () => {
      setOptimisticState(args);
      try {
        const res = await action(...args);
        if (res.ok) {
          if (onSuccess) onSuccess(res.data, ...args);
        } else {
          toast.error(res.error.message || errorMessage);
          if (onError) onError(res.error, ...args);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : errorMessage;
        toast.error(message);
        if (onError) onError({ message }, ...args);
      }
    });
  };

  return {
    state: optimisticState,
    execute,
    isPending,
  };
}
