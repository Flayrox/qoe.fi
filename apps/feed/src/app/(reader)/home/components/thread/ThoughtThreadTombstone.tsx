"use client"

import React from "react"
import { AlertCircle } from "lucide-react"

export interface ThoughtThreadTombstoneProps {
  reason?: string
}

export function ThoughtThreadTombstone({ reason = "author_deleted" }: ThoughtThreadTombstoneProps) {
  return (
    <div className="py-2.5 px-3.5 my-1.5 bg-muted/20 border border-border/30 rounded-xl flex items-center gap-2.5 text-xs text-muted-foreground italic font-sans">
      <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      <span>
        {reason === "author_deleted"
          ? "Cette pensée a été supprimée par son auteur."
          : "Contenu non disponible."}
      </span>
    </div>
  )
}
