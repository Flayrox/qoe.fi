'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ⏳ File de toggles — port de `useToggleMutationQueue` de Bluesky.
 *
 * Sérialise les toggles rapides (like/repost) : une seule requête à la fois,
 * les demandes consécutives identiques sont ignorées, et l'état confirmé par
 * le serveur alimente la tâche suivante. Évite les courses de clics.
 */

type Task<TServerState> = {
  isOn: boolean;
  resolve: (serverState: TServerState) => void;
  reject: (e: unknown) => void;
};

type TaskQueue<TServerState> = {
  activeTask: Task<TServerState> | null;
  queuedTask: Task<TServerState> | null;
};

function AbortError() {
  const e = new Error();
  e.name = 'AbortError';
  return e;
}

export function useToggleMutationQueue<TServerState>({
  initialState,
  runMutation,
  onSuccess,
}: {
  initialState: TServerState;
  runMutation: (prevState: TServerState, nextIsOn: boolean) => Promise<TServerState>;
  onSuccess: (finalState: TServerState) => void;
}) {
  // On utilise la file comme objet mutable : sûr car jamais lu pour le rendu.
  const [queue] = useState<TaskQueue<TServerState>>({
    activeTask: null,
    queuedTask: null,
  });

  async function processQueue() {
    if (queue.activeTask) {
      // Un autre processQueue est déjà en train d'itérer : il s'en charge.
      return;
    }
    // On capture l'état une fois au départ pour ne pas dépendre de l'état rendu.
    let confirmedState: TServerState = initialState;
    try {
      while (queue.queuedTask) {
        const prevTask = queue.activeTask;
        const nextTask = queue.queuedTask;
        queue.activeTask = nextTask;
        queue.queuedTask = null;
        if (prevTask?.isOn === nextTask.isOn) {
          prevTask.reject(AbortError());
          continue;
        }
        try {
          confirmedState = await runMutation(confirmedState, nextTask.isOn);
          nextTask.resolve(confirmedState);
        } catch (e) {
          nextTask.reject(e);
        }
      }
    } finally {
      onSuccess(confirmedState);
      queue.activeTask = null;
      queue.queuedTask = null;
    }
  }

  function queueToggle(isOn: boolean): Promise<TServerState> {
    return new Promise((resolve, reject) => {
      // C'est un toggle : la prochaine valeur remplace la valeur en attente.
      if (queue.queuedTask) {
        queue.queuedTask.reject(AbortError());
      }
      queue.queuedTask = { isOn, resolve, reject };
      processQueue();
    });
  }

  const queueToggleRef = useRef(queueToggle);
  useEffect(() => {
    queueToggleRef.current = queueToggle;
  });
  const queueToggleStable = useCallback((isOn: boolean): Promise<TServerState> => {
    return queueToggleRef.current(isOn);
  }, []);
  return queueToggleStable;
}
