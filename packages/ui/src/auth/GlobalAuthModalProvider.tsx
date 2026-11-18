'use client';

import React from 'react';
// ⚠️ Import RELATIF, jamais `@qoe/ui` : le barrel exporte ce fichier, donc
// s'importer soi-même par son nom de paquet crée un cycle ESM
// (`index.ts` → `GlobalAuthModalProvider` → `index.ts`). Il tient tant que
// personne ne lit les liaisons pendant l'initialisation, et casse dès qu'un
// bundler réordonne (`Cannot access 'X' before initialization`).
import { AuthModalProvider, useAuthModal } from './AuthModalContext';
import { LoginModal } from '../LoginModal';

function AuthModalManagerInner() {
  const { isOpen, mode, actionContext, nextUrl, closeAuthModal } = useAuthModal();

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={closeAuthModal}
      initialMode={mode}
      actionContext={actionContext}
      nextUrl={nextUrl}
    />
  );
}

export function GlobalAuthModalProvider({
  children,
  isAuthenticated = false,
}: {
  children: React.ReactNode;
  isAuthenticated?: boolean;
}) {
  return (
    <AuthModalProvider isAuthenticated={isAuthenticated}>
      {children}
      <AuthModalManagerInner />
    </AuthModalProvider>
  );
}
