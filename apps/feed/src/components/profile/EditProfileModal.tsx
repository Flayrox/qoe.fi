"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { updateProfileAction as updateProfile } from "@qoe/api-client/actions/feed"

import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { useTranslate } from "@qoe/i18n"

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  user: {
    id: string
    name: string | null
    username: string | null
    logoUrl: string | null
    headerImageUrl?: string | null
    heroText: string | null
    onboardingText?: string | null
  }
  onProfileUpdated?: (updatedUser: any) => void
}

export function EditProfileModal({
  isOpen,
  onClose,
  user,
  onProfileUpdated
}: EditProfileModalProps) {
  const { t } = useTranslate()
  const [name, setName] = useState(user.name || "")
  const [heroText, setHeroText] = useState(user.heroText || "")
  const [locationText, setLocationText] = useState(user.onboardingText || "")
  const [logoUrl, setLogoUrl] = useState(user.logoUrl || "")
  const [headerImageUrl, setHeaderImageUrl] = useState(user.headerImageUrl || "")
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await updateProfile({
        name,
        heroText,
        onboardingText: locationText,
        logoUrl: logoUrl || undefined,
        headerImageUrl: headerImageUrl || undefined,
      })

      if (res.ok && res.data?.user) {
        toast.success(t("profile.edit_success", "Profil mis à jour avec succès !"))
        if (onProfileUpdated) {
          onProfileUpdated(res.data.user)
        }
        onClose()
      } else {
        toast.error(t("profile.edit_error", "Erreur lors de la mise à jour."))
      }
    } catch (err) {
      console.error(err)
      toast.error(t("profile.edit_error", "Erreur de mise à jour."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-card text-card-foreground border border-border/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
            <h3 className="font-semibold text-base text-foreground">Éditer le profil</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">
            {/* Banner Preview & Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Bannière (URL Image)</label>
              <div className="relative h-28 w-full rounded-lg bg-muted overflow-hidden border border-border/40 flex items-center justify-center">
                {headerImageUrl ? (
                  <img src={headerImageUrl} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Camera className="w-4 h-4" />
                    <span>Aucune bannière</span>
                  </div>
                )}
              </div>
              <input
                type="url"
                value={headerImageUrl}
                onChange={(e) => setHeaderImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all"
              />
            </div>

            {/* Avatar Preview & Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Photo de profil (URL Image)</label>
              <div className="flex items-center gap-4">
                <AuthorAvatar
                  user={{ name, logoUrl, isCertified: false }}
                  size="xl"
                  showBadge={false}
                />
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all"
                />
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nom complet</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                required
                className="w-full text-sm border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all font-medium"
              />
            </div>

            {/* Bio Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Bio / Présentation</label>
              <textarea
                value={heroText}
                onChange={(e) => setHeroText(e.target.value)}
                placeholder="Décrivez-vous en quelques mots..."
                rows={3}
                className="w-full text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 resize-none outline-none transition-all"
              />
            </div>

            {/* Location Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Localisation / Ville</label>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Paris, France"
                className="w-full text-xs border border-border/50 focus:border-foreground bg-muted/30 focus:bg-card text-foreground rounded-lg p-2.5 outline-none transition-all"
              />
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2 bg-foreground text-background text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Enregistrer</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
