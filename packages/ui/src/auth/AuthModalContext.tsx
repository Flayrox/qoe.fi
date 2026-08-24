'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthActionContext } from '../LoginModal';

export interface AuthModalState {
  isOpen: boolean;
  mode: 'login' | 'signup' | 'magic-link';
  actionContext?: AuthActionContext;
  nextUrl?: string;
}

export interface AuthModalContextValue extends AuthModalState {
  openAuthModal: (options?: {
    mode?: 'login' | 'signup' | 'magic-link';
    actionContext?: AuthActionContext;
    nextUrl?: string;
  }) => void;
  closeAuthModal: () => void;
  setMode: (mode: 'login' | 'signup' | 'magic-link') => void;
  withAuth: <T extends (...args: never[]) => unknown>(
    fn: T,
    options?: { actionContext?: AuthActionContext; mode?: 'login' | 'signup' | 'magic-link' }
  ) => (...args: Parameters<T>) => unknown;
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined);

export interface AuthModalProviderProps {
  children: React.ReactNode;
  isAuthenticated?: boolean;
}

export function AuthModalProvider({ children, isAuthenticated = false }: AuthModalProviderProps) {
  const [modalState, setModalState] = useState<AuthModalState>({
    isOpen: false,
    mode: 'login',
  });

  // Auto-open modal if URL has ?auth=login or ?auth=signup
  useEffect(() => {
    if (typeof window === 'undefined' || isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');
    const nextParam = params.get('next');

    if (authParam === 'login' || authParam === 'signup' || authParam === 'magic-link') {
      setModalState({
        isOpen: true,
        mode: authParam,
        nextUrl: nextParam || window.location.pathname + window.location.search,
      });
    }
  }, [isAuthenticated]);

  // Listen to qoe:unauthorized global custom events from @qoe/sdk
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUnauthorized = () => {
      setModalState({
        isOpen: true,
        mode: 'login',
        nextUrl: window.location.pathname + window.location.search,
      });
    };

    window.addEventListener('qoe:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('qoe:unauthorized', handleUnauthorized);
    };
  }, []);

  const openAuthModal = useCallback(
    (options?: {
      mode?: 'login' | 'signup' | 'magic-link';
      actionContext?: AuthActionContext;
      nextUrl?: string;
    }) => {
      const currentUrl =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      setModalState({
        isOpen: true,
        mode: options?.mode || 'login',
        actionContext: options?.actionContext,
        nextUrl: options?.nextUrl || currentUrl,
      });
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const setMode = useCallback((mode: 'login' | 'signup' | 'magic-link') => {
    setModalState((prev) => ({ ...prev, mode }));
  }, []);

  const withAuth = useCallback(
    <T extends (...args: never[]) => unknown>(
      fn: T,
      options?: { actionContext?: AuthActionContext; mode?: 'login' | 'signup' | 'magic-link' }
    ) => {
      return (...args: Parameters<T>): unknown => {
        if (!isAuthenticated) {
          openAuthModal({
            mode: options?.mode || 'login',
            actionContext: options?.actionContext,
          });
          return;
        }
        return fn(...args);
      };
    },
    [isAuthenticated, openAuthModal]
  );

  const value: AuthModalContextValue = {
    ...modalState,
    openAuthModal,
    closeAuthModal,
    setMode,
    withAuth,
  };

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}

export function useRequireAuth() {
  const { withAuth, openAuthModal } = useAuthModal();
  return { withAuth, openAuthModal };
}
