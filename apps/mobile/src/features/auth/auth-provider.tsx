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
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAccessToken(data.session?.access_token ?? null);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAccessToken(nextSession?.access_token ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: fullName ? { full_name: fullName } : undefined },
      });
      return {
        error: error?.message ?? null,
        needsConfirmation: !error && !data.session,
      };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, signIn, signUp, signOut }),
    [session, isLoading, signIn, signUp, signOut]
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
