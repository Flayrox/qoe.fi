"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Loader2, Mail, Lock, User, AtSign, CheckCircle2, AlertCircle } from "lucide-react"
import { createClient } from "@qoe/supabase/client"
import { cn } from "@qoe/utils"

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

const springs = {
  overlay: { duration: 0.25, ease: "easeOut" },
  modal: { type: "spring" as const, stiffness: 380, damping: 28 },
  fade: { duration: 0.18 }
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  const handleClose = () => {
    if (loading) return
    setError(null)
    setSuccess(false)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    setLoading(true)
    setError(null)

    try {
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (authError) throw authError

        if (data.user) {
          setSuccess(true)
          // Smoothly reload page after success checkmark animation
          setTimeout(() => {
            window.location.reload()
          }, 1200)
        }
      } else {
        // Inscription
        if (!name.trim() || !username.trim()) {
          throw new Error("Veuillez remplir tous les champs.")
        }

        const cleanUsername = username.startsWith("@") ? username : `@${username}`

        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              username: cleanUsername,
            }
          }
        })

        if (authError) throw authError

        if (data.user) {
          setSuccess(true)
          setTimeout(() => {
            window.location.href = "/onboarding"
          }, 1200)
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err)
      setError(err.message || "Une erreur est survenue lors de l'authentification.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop glass blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.overlay}
            className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[10px]"
            onClick={handleClose}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={springs.modal}
            className={cn(
              "relative z-10 w-full max-w-md overflow-hidden",
              "bg-white/75 backdrop-blur-[24px] border border-neutral-200/50 shadow-2xl",
              "rounded-2xl p-8 flex flex-col gap-6"
            )}
            style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.1)" }}
          >
            {/* Close Button */}
            {!loading && (
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 p-2 rounded-full text-neutral-450 hover:bg-neutral-100/70 hover:text-neutral-800 transition-all cursor-pointer outline-none"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Logo + Header */}
            <div className="text-center space-y-2 mt-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 text-[#EE4B2B] mb-2 font-serif font-black text-lg select-none">
                Q
              </div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 leading-none">
                {mode === "login" ? "Se connecter à QOE" : "Créer un compte"}
              </h3>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-bold pt-0.5">
                {mode === "login" ? "Le sanctuaire de la lecture profonde" : "Rejoignez le réseau souverain"}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {success ? (
                /* Success animation screen */
                <motion.div
                  key="success-screen"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={springs.fade}
                  className="flex flex-col items-center justify-center py-8 text-center gap-4"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                  >
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </motion.div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-neutral-900">
                      {mode === "login" ? "Connexion réussie !" : "Compte créé !"}
                    </h4>
                    <p className="text-xs text-neutral-500">
                      {mode === "login" ? "Préparation de votre sanctuaire de lecture..." : "Bienvenue sur QOE. Redirection..."}
                    </p>
                  </div>
                </motion.div>
              ) : (
                /* Regular form screen */
                <motion.div
                  key="form-screen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={springs.fade}
                  className="space-y-4"
                >
                  {/* Tab Switcher */}
                  {!loading && (
                    <div className="flex bg-neutral-100/70 p-1 rounded-xl border border-neutral-200/20">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login")
                          setError(null)
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer",
                          mode === "login"
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-450 hover:text-neutral-800"
                        )}
                      >
                        Connexion
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("signup")
                          setError(null)
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer",
                          mode === "signup"
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-450 hover:text-neutral-800"
                        )}
                      >
                        Inscription
                      </button>
                    </div>
                  )}

                  {/* Error Notification */}
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[11px] font-medium text-[#EE4B2B] flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Auth Form */}
                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    {mode === "signup" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-3.5 overflow-hidden"
                      >
                        {/* Full Name input */}
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block pl-0.5">Nom complet</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
                              <User className="w-3.5 h-3.5" />
                            </span>
                            <input
                              type="text"
                              required={mode === "signup"}
                              disabled={loading}
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Marc Dutronc"
                              className="h-11 w-full pl-9 pr-4 rounded-xl bg-neutral-50/50 border border-neutral-200/70 focus:border-[#EE4B2B] focus:bg-white text-xs outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Username input */}
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block pl-0.5">Nom d'utilisateur</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
                              <AtSign className="w-3.5 h-3.5" />
                            </span>
                            <input
                              type="text"
                              required={mode === "signup"}
                              disabled={loading}
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="marcdutronc"
                              className="h-11 w-full pl-9 pr-4 rounded-xl bg-neutral-50/50 border border-neutral-200/70 focus:border-[#EE4B2B] focus:bg-white text-xs outline-none transition-all"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Email input */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block pl-0.5">Adresse email</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
                          <Mail className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="email"
                          required
                          disabled={loading}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="vous@exemple.com"
                          className="h-11 w-full pl-9 pr-4 rounded-xl bg-neutral-50/50 border border-neutral-200/70 focus:border-[#EE4B2B] focus:bg-white text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Password input */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block pl-0.5">Mot de passe</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="password"
                          required
                          disabled={loading}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-11 w-full pl-9 pr-4 rounded-xl bg-neutral-50/50 border border-neutral-200/70 focus:border-[#EE4B2B] focus:bg-white text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        "w-full h-11 font-sans font-bold mt-2.5 rounded-xl text-xs uppercase tracking-wider",
                        "bg-[#EE4B2B] hover:bg-[#d63d20] text-white cursor-pointer transition-colors shadow-sm",
                        "flex items-center justify-center gap-2 disabled:opacity-50"
                      )}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Authentification...</span>
                        </>
                      ) : (
                        <span>{mode === "login" ? "Se connecter" : "S'inscrire"}</span>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
