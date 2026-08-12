"use client"

import React, { useState } from "react"
import { Flag, Loader2, Check } from "lucide-react"
import { reportTargetAction } from "@qoe/api-client/actions/feed"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog"

export interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  targetId: string
  targetType?: "thought" | "article" | "user" | "comment"
  authorName?: string
}

const REPORT_REASONS = [
  { id: "spam", label: "Spam ou publicité non sollicitée" },
  { id: "harassment", label: "Harcèlement, haine ou intimidation" },
  { id: "misinformation", label: "Désinformation ou propos trompeurs" },
  { id: "inappropriate", label: "Contenu inapproprié ou explicite" },
  { id: "other", label: "Autre motif" },
]

export function ReportModal({
  isOpen,
  onClose,
  targetId,
  targetType = "thought",
  authorName,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("spam")
  const [details, setDetails] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await reportTargetAction({
        targetId,
        targetType,
        reason: selectedReason,
        details: details.trim() || undefined,
      })

      if (res.ok) {
        toast.success("Signalement transmis à l'équipe de modération.")
        onClose()
      } else {
        toast.error("Erreur lors de l'envoi du signalement.")
      }
    } catch {
      toast.error("Erreur réseau.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md p-6 rounded-2xl bg-card border border-border/40 shadow-2xl font-sans">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            <span>Signaler le contenu</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Aidez-nous à préserver la qualité de la communauté{authorName ? ` (${authorName})` : ""}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Motif du signalement</label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReason(r.id)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
                    selectedReason === r.id
                      ? "border-amber-500/50 bg-amber-500/10 text-foreground"
                      : "border-border/30 bg-background/50 hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <span>{r.label}</span>
                  {selectedReason === r.id && <Check className="w-3.5 h-3.5 text-amber-500" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Précisions (optionnel)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Expliquez brièvement le problème..."
              rows={3}
              className="w-full p-2.5 rounded-xl border border-border/40 bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Envoyer</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
