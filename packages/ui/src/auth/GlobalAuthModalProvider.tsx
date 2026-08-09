"use client"

import React from "react"
import { AuthModalProvider, LoginModal, useAuthModal } from "@qoe/ui"

function AuthModalManagerInner() {
  const { isOpen, mode, actionContext, nextUrl, closeAuthModal } = useAuthModal()

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={closeAuthModal}
      initialMode={mode}
      actionContext={actionContext}
      nextUrl={nextUrl}
    />
  )
}

export function GlobalAuthModalProvider({
  children,
  isAuthenticated = false,
}: {
  children: React.ReactNode
  isAuthenticated?: boolean
}) {
  return (
    <AuthModalProvider isAuthenticated={isAuthenticated}>
      {children}
      <AuthModalManagerInner />
    </AuthModalProvider>
  )
}
