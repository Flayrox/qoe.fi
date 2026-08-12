"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { LoginFormBento } from "./LoginFormBento"
import type { AuthActionContext } from "./GuestFloatingBar"
export type { AuthActionContext }

export interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: "login" | "signup" | "magic-link"
  actionContext?: AuthActionContext
  nextUrl?: string
}

const springs = {
  overlay: { duration: 0.25, ease: "easeOut" as const },
  modal: { type: "spring" as const, stiffness: 380, damping: 28 },
}

export function LoginModal({
  isOpen,
  onClose,
  initialMode = "login",
  actionContext,
}: LoginModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
          {/* Glass blur Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.overlay}
            className="fixed inset-0 bg-neutral-950/60 backdrop-blur-[12px]"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 15 }}
            animate={{ opacity: 1, scale: 0.9, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 15 }}
            transition={springs.modal}
            className="relative z-10 w-full max-w-5xl mx-auto my-auto origin-center"
          >
            {/* Floating Close Button */}
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 z-50 p-2.5 rounded-full bg-card text-card-foreground border border-border shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>

            <LoginFormBento
              initialMode={initialMode}
              actionContext={actionContext}
              onSuccess={onClose}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
