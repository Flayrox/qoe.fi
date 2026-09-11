'use client';

import { useState, useEffect } from 'react';
import { getCurrentUserWalletAction, type UserWalletDTO } from '@qoe/sdk/actions/tenant';

interface PassiveSessionState {
  user: UserWalletDTO | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

let cachedSession: UserWalletDTO | null = null;
let hasCheckedSession = false;

/**
 * usePassiveSession — Détecte et hydrate en tâche de fond le profil de l'utilisateur
 * et son portefeuille sur les sites tenants (sans impacter le rendu serveur initial).
 */
export function usePassiveSession(): PassiveSessionState {
  const [user, setUser] = useState<UserWalletDTO | null>(cachedSession);
  const [isLoading, setIsLoading] = useState(!hasCheckedSession);

  useEffect(() => {
    if (hasCheckedSession) {
      setUser(cachedSession);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    getCurrentUserWalletAction()
      .then((res) => {
        if (!isMounted) return;
        if (res.ok && res.data) {
          cachedSession = res.data;
          setUser(res.data);
        } else {
          cachedSession = null;
          setUser(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          cachedSession = null;
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          hasCheckedSession = true;
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
  };
}
