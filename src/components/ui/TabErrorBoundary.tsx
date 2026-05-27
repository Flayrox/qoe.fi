"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RefreshCw, X } from "lucide-react"
import { useTabStore } from "@/lib/use-tab-store"

interface Props {
  children: ReactNode
  tabId: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class TabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught tab error:", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <TabErrorFallback 
          tabId={this.props.tabId} 
          error={this.state.error} 
          onReset={this.handleReset} 
        />
      )
    }

    return this.props.children
  }
}

function TabErrorFallback({ tabId, error, onReset }: { tabId: string; error: Error | null; onReset: () => void }) {
  const { removeTab, setActiveTabId } = useTabStore()

  const handleClose = () => {
    removeTab(tabId)
    setActiveTabId("timeline")
  }

  return (
    <div className="bg-white border border-neutral-200/50 rounded-xl p-8 shadow-xs flex flex-col items-center justify-center text-center gap-4 py-16 animate-fadeIn">
      <div className="p-3 bg-red-50 text-[#EE4B2B] rounded-full border border-red-100">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-xs text-neutral-800 leading-none">Oups, cet onglet a rencontré un problème</h4>
        <p className="text-[11px] text-neutral-400 max-w-sm leading-relaxed">
          Une erreur imprévue s'est produite lors du rendu de ce composant. Détails : <code className="bg-neutral-50 px-1.5 py-0.5 rounded text-neutral-600 font-mono text-[10px] block mt-1">{error?.message || "Erreur interne"}</code>
        </p>
      </div>

      <div className="flex gap-2 items-center mt-2">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Réessayer
        </button>
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Fermer l'onglet
        </button>
      </div>
    </div>
  )
}
