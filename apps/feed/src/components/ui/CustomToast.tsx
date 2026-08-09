"use client"

import React, { createContext, useContext, useState, useCallback } from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"
import { cn } from "@qoe/utils"

export type ToastType = "success" | "error" | "info"

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  toastSuccess: (message: string) => void
  toastError: (message: string) => void
  toastInfo: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toastVariants = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 stroke-[1.5]" />,
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 stroke-[1.5]" />,
  },
  info: {
    icon: <Info className="h-4 w-4 text-sky-400 shrink-0 stroke-[1.5]" />,
  },
}

function ToastItem({
  id,
  message,
  type,
  onDismiss,
}: ToastMessage & { onDismiss: (id: string) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 3500)
    return () => clearTimeout(timer)
  }, [id, onDismiss])

  const variant = toastVariants[type] || toastVariants.info

  return (
    <div
      role="status"
      className={cn(
        "relative pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 rounded-xl",
        "bg-zinc-950/85 dark:bg-zinc-900/90 backdrop-blur-2xl backdrop-saturate-150",
        "border border-white/[0.08] shadow-2xl shadow-black/50",
        "text-foreground text-xs font-medium tracking-tight select-none",
        "transition-all duration-200 ease-out animate-in fade-in slide-in-from-top-3"
      )}
    >
      {/* Specular top rim light highlight */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-xl pointer-events-none" />

      {variant.icon}

      <span className="truncate max-w-[280px] font-sans">{message}</span>

      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="ml-auto p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
        aria-label="Fermer"
      >
        <X className="h-3.5 w-3.5 stroke-[1.5]" />
      </button>
    </div>
  )
}

export function CustomToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    setToasts((prev) => [{ id, message, type }, ...prev].slice(0, 3))
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toastSuccess = useCallback((msg: string) => addToast(msg, "success"), [addToast])
  const toastError = useCallback((msg: string) => addToast(msg, "error"), [addToast])
  const toastInfo = useCallback((msg: string) => addToast(msg, "info"), [addToast])

  return (
    <ToastContext.Provider
      value={{
        toast: addToast,
        toastSuccess,
        toastError,
        toastInfo,
      }}
    >
      {children}
      {/* Toast Viewport (Fixed top center) */}
      <div className="fixed top-5 inset-x-0 z-50 pointer-events-none flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useCustomToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useCustomToast must be used within CustomToastProvider")
  }
  return ctx
}
