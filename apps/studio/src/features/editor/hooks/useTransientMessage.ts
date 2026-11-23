'use client';

// =====================================================================
// 💬 useTransientMessage — message éphémère, un seul minuteur vivant
// =====================================================================
// 📖 Affiche un message pendant `durationMs`, puis l'efface.
//
// ⚠️ Un `setTimeout(() => setState(null), 3000)` posé à la volée dans un
//    gestionnaire fuit : rien ne l'annule au démontage (React avertit
//    « state update on an unmounted component ») et un second message en
//    laisse deux en course — le premier efface le second. Ce hook garde **un**
//    minuteur : chaque `show` annule le précédent, et le démontage l'annule
//    aussi. Le minuteur est remis à `null` quand il tire, pour que `clear()`
//    ne s'applique jamais à un identifiant déjà consommé.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TransientMessage {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

export const TRANSIENT_MESSAGE_MS = 3000;

export function useTransientMessage(durationMs: number = TRANSIENT_MESSAGE_MS): TransientMessage {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const show = useCallback(
    (next: string) => {
      clear();
      setMessage(next);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, durationMs);
    },
    [clear, durationMs]
  );

  // Le démontage emporte le minuteur : plus aucun `setState` après coup.
  useEffect(() => clear, [clear]);

  return { message, show, clear };
}
