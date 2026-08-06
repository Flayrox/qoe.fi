"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, AlertCircle } from "lucide-react"
import { createClient } from "@qoe/supabase/client"
import { cn } from "@qoe/utils"
import { BentoPlateau, BentoItem } from "./BentoPlateau"
import { Logo } from "./Logo"
import { Button } from "./button"

export type AuthActionContext = "like" | "follow" | "bookmark" | "comment" | "repost"

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: "login" | "signup" | "magic-link"
  actionContext?: AuthActionContext
  onLoginAction?: (formData: FormData) => Promise<void>
  onSignupAction?: (formData: FormData) => Promise<void>
}

const springs = {
  overlay: { duration: 0.25, ease: "easeOut" as const },
  modal: { type: "spring" as const, stiffness: 380, damping: 28 },
  fade: { duration: 0.18 }
}

export function LoginModal({
  isOpen,
  onClose,
  initialMode = "login",
  actionContext,
  onLoginAction,
  onSignupAction,
}: LoginModalProps) {
  const [authMode, setAuthMode] = useState<'magic-link' | 'password' | 'signup'>(
    initialMode === "signup" ? "signup" : "magic-link"
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [manifestoIdx, setManifestoIdx] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setAuthMode(initialMode === "signup" ? "signup" : "magic-link")
      setLocalError(null)
      setMagicLinkSent(false)
    }
  }, [isOpen, initialMode])

  const getContextSubtitle = () => {
    if (actionContext === "like") {
      return "Connectez-vous pour aimer ce post et soutenir cet auteur"
    }
    if (actionContext === "follow") {
      return "Abonnez-vous à cet auteur pour ne rater aucun de ses écrits"
    }
    if (actionContext === "bookmark") {
      return "Enregistrez cet article dans votre sanctuaire de lecture"
    }
    if (actionContext === "comment") {
      return "Rejoignez la conversation et répondez à l'auteur"
    }
    if (actionContext === "repost") {
      return "Partagez ce post avec vos abonnés"
    }
    return authMode === 'signup' 
      ? "Rejoignez le réseau souverain" 
      : "Accédez à votre espace"
  }

  const manifestoMessages = [
    {
      target: "Créateurs",
      title: "Reprenez le contrôle \nde votre audience.",
      desc: "Pas de publicités. Pas d'algorithmes opaques. Juste vous et vos lecteurs, sur une infrastructure souveraine.",
    },
    {
      target: "Lecteurs",
      title: "Retrouvez le goût \ndu temps long.",
      desc: "Un sanctuaire dédié à la lecture profonde. Fuyez le bruit constant, cultivez le silence et choisissez qui vous influence.",
    }
  ]

  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => {
      setManifestoIdx((prev) => (prev === 0 ? 1 : 0))
    }, 6000)
    return () => clearInterval(interval)
  }, [isOpen])

  const supabase = createClient()

  const handleOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true)
      setLocalError(null)
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue."
      setLocalError(message)
      setLoading(false)
    }
  }

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    try {
      setLoading(true)
      setLocalError(null)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      setMagicLinkSent(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue."
      setLocalError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setLocalError(null)
    setMagicLinkSent(false)
    onClose()
  }

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
            onClick={handleClose}
          />

          {/* Modal Container — Full Bento Plateau Layout */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={springs.modal}
            className="relative z-10 w-full max-w-5xl mx-auto my-auto"
          >
            {/* Floating Close Button */}
            {!loading && (
              <button
                onClick={handleClose}
                className="absolute -top-3 -right-3 z-50 p-2.5 rounded-full bg-card text-foreground border border-border shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <BentoPlateau className="md:h-[600px] shadow-2xl rounded-3xl overflow-hidden border border-border/50">
              {/* Auth Side (Left) */}
              <BentoItem 
                active={true} 
                flexBasisActive="55%" 
                innerClassName="bg-card text-card-foreground"
              >
                <div className="w-full h-full flex flex-col items-center justify-center p-6 md:p-10 relative">
                  <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="mb-6 text-center">
                      <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1.5">
                        {authMode === 'signup' ? 'Créer un compte' : 'Connexion'}
                      </h2>
                      <p className="text-muted-foreground text-xs md:text-sm">
                        {getContextSubtitle()}
                      </p>
                    </div>

                    {/* Error display */}
                    {localError && (
                      <div className="p-3 mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono rounded-xl flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="flex-1">{localError}</div>
                      </div>
                    )}

                    {/* Success screen for Magic Link */}
                    {magicLinkSent ? (
                      <div className="text-center py-6 space-y-4 animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                          ✓
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold text-emerald-500">Lien magique envoyé</h3>
                          <p className="text-muted-foreground text-xs leading-relaxed px-4">
                            Consultez votre boîte mail et cliquez sur le lien pour vous connecter.
                          </p>
                        </div>
                        <Button
                          onClick={() => setMagicLinkSent(false)}
                          variant="outline"
                          className="mt-4 text-xs font-mono"
                        >
                          Retour
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Social Logins - Mini Bento Style */}
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleOAuth('google')}
                            className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/60 transition-colors group cursor-pointer"
                          >
                            <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border/50 group-hover:scale-105 transition-transform shrink-0">
                              <svg className="w-4 h-4 text-foreground" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" fillOpacity="0.5" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" fillOpacity="0.3" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="currentColor" fillOpacity="0.6" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                              </svg>
                            </div>
                            <div className="flex-1 flex items-center justify-center pr-2">
                              <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground transition-colors">Google</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOAuth('apple')}
                            className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/60 transition-colors group cursor-pointer"
                          >
                            <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border/50 group-hover:scale-105 transition-transform shrink-0">
                              <svg className="w-4 h-4 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z" />
                              </svg>
                            </div>
                            <div className="flex-1 flex items-center justify-center pr-2">
                              <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground transition-colors">Apple</span>
                            </div>
                          </button>
                        </div>

                        {/* Separator */}
                        <div className="flex items-center gap-4 my-4 opacity-60">
                          <div className="flex-1 h-px bg-border"></div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Ou</span>
                          <div className="flex-1 h-px bg-border"></div>
                        </div>

                        {/* Interactive Modes */}
                        {authMode === 'magic-link' && (
                          <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground block mb-0.5">Email</label>
                              <input
                                type="email"
                                required
                                disabled={loading}
                                value={email}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                                placeholder="vous@exemple.com"
                                className="h-10 w-full rounded-xl bg-muted/40 border border-border text-xs px-3 text-foreground"
                              />
                            </div>
                            <Button
                              type="submit"
                              disabled={loading}
                              className="w-full h-10 font-sans font-semibold mt-2 rounded-xl bg-[#EE4B2B] hover:bg-[#d63d20] text-white transition-colors text-xs cursor-pointer"
                            >
                              {loading ? 'Chargement...' : 'Recevoir un lien magique'}
                            </Button>
                          </form>
                        )}

                        {(authMode === 'password' || authMode === 'signup') && (
                          <form action={authMode === 'password' ? onLoginAction : onSignupAction} className="space-y-3">
                            {authMode === 'signup' && (
                              <>
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground block mb-0.5">Nom complet</label>
                                  <input
                                    name="name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                    placeholder="Marc Dutronc"
                                    className="h-10 w-full rounded-xl bg-muted/40 border border-border text-xs px-3 text-foreground"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground block mb-0.5">Nom d'utilisateur</label>
                                  <input
                                    name="username"
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                                    placeholder="@marcdutronc"
                                    className="h-10 w-full rounded-xl bg-muted/40 border border-border text-xs px-3 text-foreground"
                                  />
                                </div>
                              </>
                            )}

                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground block mb-0.5">Email</label>
                              <input
                                name="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                                placeholder="vous@exemple.com"
                                className="h-10 w-full rounded-xl bg-muted/40 border border-border text-xs px-3 text-foreground"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground block mb-0.5">Mot de passe</label>
                              <input
                                name="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-10 w-full rounded-xl bg-muted/40 border border-border text-xs px-3 text-foreground"
                              />
                            </div>

                            <Button
                              type="submit"
                              disabled={loading}
                              className="w-full h-10 font-sans font-semibold mt-3 rounded-xl bg-[#EE4B2B] hover:bg-[#d63d20] text-white transition-colors text-xs cursor-pointer"
                            >
                              {loading ? 'Chargement...' : (authMode === 'password' ? 'Se connecter' : 'S\'inscrire')}
                            </Button>
                          </form>
                        )}

                        {/* Toggle standard/magic auth mode */}
                        <div className="text-center pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (authMode === 'magic-link') {
                                setAuthMode('password')
                              } else {
                                setAuthMode('magic-link')
                              }
                            }}
                            className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            {authMode === 'magic-link' ? 'Se connecter par mot de passe' : 'Se connecter par lien magique'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Switch */}
                  <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError(null)
                        setAuthMode(authMode === 'signup' ? 'magic-link' : 'signup')
                      }}
                      className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {authMode === 'signup' ? 'Déjà un compte ? Connexion' : 'Pas de compte ? S\'inscrire'}
                    </button>
                  </div>
                </div>
              </BentoItem>

              {/* Branding Side (Right) */}
              <BentoItem 
                active={false} 
                flexBasisInactive="45%"
                inactiveContent={
                  <div className="w-full h-full flex flex-col items-start justify-between p-8">
                    <Logo className="h-8 w-auto opacity-90" fillColor="#FFFFFF" />
                    
                    <div className="mt-auto relative w-full h-[140px]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={manifestoIdx}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -15 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="absolute inset-0 flex flex-col justify-end pb-2"
                        >
                          <p className="text-white/50 text-[10px] uppercase tracking-[0.2em] mb-3">
                            Pour les {manifestoMessages[manifestoIdx].target}
                          </p>
                          <h3 className="text-white text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-3 whitespace-pre-line">
                            {manifestoMessages[manifestoIdx].title}
                          </h3>
                          <p className="text-white/80 text-xs md:text-sm max-w-sm leading-relaxed">
                            {manifestoMessages[manifestoIdx].desc}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                }
              >
                <div />
              </BentoItem>
            </BentoPlateau>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
