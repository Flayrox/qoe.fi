import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  clearAllStoredAccounts,
  getSavedAccounts,
  removeStoredAccount,
  saveAccount,
  type StoredAccount,
} from '@/features/auth/accounts-manager';
import { queryClient } from '@/lib/query-client';
import { setAccessToken } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface AuthResult {
  error: string | null;
  /** true quand l'inscription nécessite une confirmation par email. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  savedAccounts: StoredAccount[];
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInSecondary: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
  switchAccount: (userId: string) => Promise<boolean>;
  removeAccount: (userId: string) => Promise<void>;
  updateCurrentAccountMeta: (metadata: {
    name?: string;
    username?: string;
    avatarUrl?: string | null;
    isCertified?: boolean;
  }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<StoredAccount[]>([]);

  // Charger les comptes sauvegardés au démarrage
  useEffect(() => {
    getSavedAccounts().then((accs) => {
      setSavedAccounts(accs);
    });
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAccessToken(data.session?.access_token ?? null);
      if (data.session) {
        saveAccount(data.session).then((updated) => {
          if (active) setSavedAccounts(updated);
        });
      }
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAccessToken(nextSession?.access_token ?? null);
      if (nextSession) {
        saveAccount(nextSession).then((updated) => {
          setSavedAccounts(updated);
        });
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.session) {
      const updated = await saveAccount(data.session);
      setSavedAccounts(updated);
      queryClient.clear();
    }
    return { error: error?.message ?? null };
  }, []);

  // Connexion à un compte secondaire sans casser la session en cas d'échec
  const signInSecondary = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message };
      }
      if (data.session) {
        const updated = await saveAccount(data.session);
        setSavedAccounts(updated);
        setSession(data.session);
        setAccessToken(data.session.access_token);
        queryClient.clear();
      }
      return { error: null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: fullName ? { full_name: fullName } : undefined },
      });
      if (data.session) {
        const updated = await saveAccount(data.session, { name: fullName });
        setSavedAccounts(updated);
        queryClient.clear();
      }
      return {
        error: error?.message ?? null,
        needsConfirmation: !error && !data.session,
      };
    },
    []
  );

  const signOut = useCallback(async () => {
    const currentUserId = session?.user?.id;
    await supabase.auth.signOut();
    if (currentUserId) {
      const remaining = await removeStoredAccount(currentUserId);
      setSavedAccounts(remaining);
      // S'il reste un autre compte enregistré, basculer dessus
      if (remaining.length > 0) {
        const next = remaining[0];
        const { data } = await supabase.auth.setSession({
          access_token: next.accessToken,
          refresh_token: next.refreshToken,
        });
        if (data.session) {
          setSession(data.session);
          setAccessToken(data.session.access_token);
        }
      }
    }
    queryClient.clear();
  }, [session]);

  const signOutAll = useCallback(async () => {
    await supabase.auth.signOut();
    await clearAllStoredAccounts();
    setSavedAccounts([]);
    setSession(null);
    setAccessToken(null);
    queryClient.clear();
  }, []);

  const switchAccount = useCallback(async (userId: string): Promise<boolean> => {
    const accounts = await getSavedAccounts();
    const target = accounts.find((a) => a.id === userId);
    if (!target) return false;

    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: target.accessToken,
        refresh_token: target.refreshToken,
      });

      if (error || !data.session) {
        console.warn('Could not restore session, might need re-login:', error);
        return false;
      }

      setSession(data.session);
      setAccessToken(data.session.access_token);
      const updated = await saveAccount(data.session);
      setSavedAccounts(updated);
      queryClient.clear();
      return true;
    } catch (err) {
      console.error('Error switching account:', err);
      return false;
    }
  }, []);

  const removeAccount = useCallback(
    async (userId: string) => {
      const remaining = await removeStoredAccount(userId);
      setSavedAccounts(remaining);
      if (session?.user?.id === userId) {
        if (remaining.length > 0) {
          const next = remaining[0];
          const { data } = await supabase.auth.setSession({
            access_token: next.accessToken,
            refresh_token: next.refreshToken,
          });
          if (data.session) {
            setSession(data.session);
            setAccessToken(data.session.access_token);
          }
        } else {
          await supabase.auth.signOut();
          setSession(null);
          setAccessToken(null);
        }
      }
    },
    [session]
  );

  const updateCurrentAccountMeta = useCallback(
    (metadata: {
      name?: string;
      username?: string;
      avatarUrl?: string | null;
      isCertified?: boolean;
    }) => {
      if (!session) return;
      saveAccount(session, metadata).then((updated) => {
        setSavedAccounts(updated);
      });
    },
    [session]
  );

  const value = useMemo(
    () => ({
      session,
      isLoading,
      savedAccounts,
      signIn,
      signInSecondary,
      signUp,
      signOut,
      signOutAll,
      switchAccount,
      removeAccount,
      updateCurrentAccountMeta,
    }),
    [
      session,
      isLoading,
      savedAccounts,
      signIn,
      signInSecondary,
      signUp,
      signOut,
      signOutAll,
      switchAccount,
      removeAccount,
      updateCurrentAccountMeta,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
