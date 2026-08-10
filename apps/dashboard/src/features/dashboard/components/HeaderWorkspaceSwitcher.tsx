"use client"

import React, { useState, useEffect } from "react"
import { ChevronDown, Check, Building2, User, Plus } from "lucide-react"
import { getUserWorkspacesAction } from "@/app/(creator)/media/actions"

export function HeaderWorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    getUserWorkspacesAction().then((res) => {
      if (res.success) {
        const all = [res.personal, ...(res.medias || [])]
        setWorkspaces(all)
        
        // Load saved workspace from localStorage or default to personal
        const savedId = localStorage.getItem("qoe_active_workspace_id")
        const found = all.find(w => w?.id === savedId) || res.personal
        setActiveWorkspace(found)
      }
    })
  }, [])

  const handleSelect = (ws: any) => {
    setActiveWorkspace(ws)
    localStorage.setItem("qoe_active_workspace_id", ws.id)
    localStorage.setItem("qoe_active_workspace_type", ws.type)
    setIsOpen(false)
    window.location.reload()
  }

  if (!activeWorkspace) return null

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-card/80 border border-border/40 hover:bg-muted/60 transition-all text-xs font-semibold cursor-pointer shadow-sm"
      >
        <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {activeWorkspace.type === "MEDIA" ? (
            <Building2 className="w-3 h-3" />
          ) : (
            <User className="w-3 h-3" />
          )}
        </div>
        <span className="truncate max-w-[130px] text-foreground font-medium">{activeWorkspace.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-56 rounded-2xl bg-card border border-border/40 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Espaces de Travail
          </div>

          <div className="divide-y divide-border/20">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelect(ws)}
                className="w-full text-left px-3 py-2.5 text-xs flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {ws.type === "MEDIA" ? (
                      <Building2 className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-foreground truncate">{ws.name}</p>
                    <p className="text-[10px] text-muted-foreground">{ws.type === "MEDIA" ? `Média (${ws.role || 'Membre'})` : 'Profil Personnel'}</p>
                  </div>
                </div>
                {activeWorkspace.id === ws.id && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-border/20 mt-1 pt-1 px-1">
            <a
              href="/import"
              className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Créer / Importer un Média</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
