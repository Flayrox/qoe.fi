"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { createClient } from "@qoe/supabase/client";
import { cn } from "@qoe/utils";
import { BentoPlateau, BentoItem } from "./BentoPlateau";
import { Logo } from "./Logo";
import { Button } from "./button";
import type { AuthActionContext } from "./GuestFloatingBar";

export interface LoginFormBentoProps {
  initialMode?: "login" | "signup" | "magic-link";
  actionContext?: AuthActionContext;
  onSuccess?: () => void;
  showLanguageSwitch?: boolean;
  className?: string;
}

export function LoginFormBento({
  initialMode = "login",
  actionContext,
  onSuccess,
  className,
}: LoginFormBentoProps) {
  const [authMode, setAuthMode] = useState<'magic-link' | 'password' | 'signup'>(
    initialMode === "signup" ? "signup" : "magic-link"
  );
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<number>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [manifestoIdx, setManifestoIdx] = useState(0);

  useEffect(() => {
    setAuthMode(initialMode === "signup" ? "signup" : "magic-link");
    setSignupStep(1);
    setLocalError(null);
    setMagicLinkSent(false);
  }, [initialMode]);

  const getContextSubtitle = () => {
    if (actionContext === "like") return "Connectez-vous pour aimer ce post et soutenir cet auteur";
    if (actionContext === "follow") return "Abonnez-vous à cet auteur pour ne rater aucun de ses écrits";
    if (actionContext === "bookmark") return "Enregistrez cet écrit dans votre sanctuaire de lecture";
    if (actionContext === "comment") return "Rejoignez la conversation et répondez à l'auteur";
    if (actionContext === "repost") return "Partagez ce post avec vos abonnés";
    if (authMode === 'signup') {
      return signupStep === 1 ? "Rejoignez le réseau souverain" : "Sécurisez vos identifiants";
    }
    return "Accédez à votre espace souverain";
  };

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
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setManifestoIdx((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const supabase = createClient();

  const handleOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      setLocalError(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.href)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue.";
      setLocalError(message);
      setLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setLoading(true);
      setLocalError(null);
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.href)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue.";
      setLocalError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);

    try {
      if (authMode === 'signup') {
        if (!name.trim() || !username.trim()) {
          setSignupStep(1);
          setLocalError("Veuillez renseigner votre nom et nom d'utilisateur.");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, username },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur d'authentification.";
      setLocalError(message);
    } finally {
      setLoading(false);
    }
  };

  const goToSignupStep = (step: 1 | 2) => {
    setDirection(step > signupStep ? 1 : -1);
    setSignupStep(step);
    setLocalError(null);
  };

  const handleNextStep1 = () => {
    if (!name.trim()) {
      setLocalError("Veuillez renseigner votre nom complet.");
      return;
    }
    if (!username.trim()) {
      setLocalError("Veuillez choisir un nom d'utilisateur.");
      return;
    }
    goToSignupStep(2);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 30 : -30,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -30 : 30,
      opacity: 0,
    }),
  };

  return (
    <BentoPlateau className={cn("md:h-[620px] shadow-2xl rounded-3xl overflow-hidden bg-[#EE4B2B] p-2 md:p-3 border-0", className)}>
      {/* Auth Side (Left) */}
      <BentoItem
        active={true}
        flexBasisActive="55%"
        innerClassName="bg-card text-card-foreground rounded-2xl shadow-lg border border-border/40"
      >
        <div className="w-full h-full flex flex-col items-center justify-between p-6 md:p-10 relative bg-card text-card-foreground">
          <div className="w-full max-w-md my-auto">
            {/* Header */}
            <div className="mb-4 text-center">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-card-foreground">
                {authMode === 'signup' ? 'Créer un compte' : 'Connexion'}
              </h2>
              <p className="text-muted-foreground text-xs md:text-sm">
                {getContextSubtitle()}
              </p>

              {/* Multi-Step Interactive Dots for Signup */}
              {authMode === 'signup' && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => goToSignupStep(1)}
                    className={cn(
                      "h-2 rounded-full transition-all cursor-pointer",
                      signupStep === 1 ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label="Étape 1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (name.trim() && username.trim()) goToSignupStep(2);
                    }}
                    className={cn(
                      "h-2 rounded-full transition-all cursor-pointer",
                      signupStep === 2 ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label="Étape 2"
                  />
                </div>
              )}
            </div>

            {/* Error display */}
            {localError && (
              <div className="p-3 mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{localError}</div>
              </div>
            )}

            {/* Magic Link Success */}
            {magicLinkSent ? (
              <div className="text-center py-6 space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  ✓
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-emerald-600">Lien magique envoyé</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed px-4">
                    Consultez votre boîte mail et cliquez sur le lien pour vous connecter.
                  </p>
                </div>
                <Button
                  onClick={() => setMagicLinkSent(false)}
                  variant="outline"
                  className="mt-4 text-xs font-mono border-border text-muted-foreground hover:text-foreground"
                >
                  Retour
                </Button>
              </div>
            ) : (
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={authMode === 'signup' ? `signup-step-${signupStep}` : authMode}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="space-y-4"
                >
                  {/* Signup Step 1 or Magic-Link / Password Mode */}
                  {(authMode !== 'signup' || signupStep === 1) && (
                    <>
                      {/* Social Logins - Mini Bento Style */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleOAuth('google')}
                          className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/80 transition-all group cursor-pointer"
                        >
                          <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border group-hover:scale-105 transition-transform shrink-0">
                            <svg className="w-4 h-4 text-card-foreground" viewBox="0 0 24 24">
                              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="currentColor" fillOpacity="0.5" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="currentColor" fillOpacity="0.3" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="currentColor" fillOpacity="0.6" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                          </div>
                          <div className="flex-1 flex items-center justify-center pr-2">
                            <span className="text-[12px] font-semibold text-card-foreground/80 group-hover:text-card-foreground transition-colors">Google</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOAuth('apple')}
                          className="w-full flex items-center p-1.5 rounded-2xl bg-muted/60 hover:bg-muted border border-border/80 transition-all group cursor-pointer"
                        >
                          <div className="w-9 h-9 bg-card rounded-xl flex items-center justify-center shadow-xs border border-border group-hover:scale-105 transition-transform shrink-0">
                            <svg className="w-4 h-4 text-card-foreground" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z" />
                            </svg>
                          </div>
                          <div className="flex-1 flex items-center justify-center pr-2">
                            <span className="text-[12px] font-semibold text-card-foreground/80 group-hover:text-card-foreground transition-colors">Apple</span>
                          </div>
                        </button>
                      </div>

                      {/* Separator */}
                      <div className="flex items-center gap-4 my-3 opacity-60">
                        <div className="flex-1 h-px bg-border"></div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Ou</span>
                        <div className="flex-1 h-px bg-border"></div>
                      </div>
                    </>
                  )}

                  {/* Form Content by Mode */}
                  {authMode === 'magic-link' && (
                    <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Email</label>
                        <input
                          type="email"
                          required
                          disabled={loading}
                          value={email}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                          placeholder="vous@exemple.com"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 font-sans font-bold mt-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                      >
                        {loading ? 'Chargement...' : 'Recevoir un lien magique'}
                      </Button>
                    </form>
                  )}

                  {authMode === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Email</label>
                        <input
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                          placeholder="vous@exemple.com"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Mot de passe</label>
                        <input
                          name="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 font-sans font-bold mt-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                      >
                        {loading ? 'Chargement...' : 'Se connecter'}
                      </Button>
                    </form>
                  )}

                  {authMode === 'signup' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                      {signupStep === 1 ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Nom complet</label>
                            <input
                              name="name"
                              type="text"
                              required
                              value={name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                              placeholder="Marc Dutronc"
                              className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Nom d'utilisateur</label>
                            <input
                              name="username"
                              type="text"
                              required
                              value={username}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                              placeholder="@marcdutronc"
                              className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                          </div>

                          <Button
                            type="button"
                            onClick={handleNextStep1}
                            className="w-full h-10 font-sans font-bold mt-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20 flex items-center justify-center gap-1"
                          >
                            <span>Continuer</span>
                            <span>→</span>
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Adresse Email</label>
                            <input
                              name="email"
                              type="email"
                              required
                              value={email}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                              placeholder="vous@exemple.com"
                              className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-0.5">Mot de passe</label>
                            <input
                              name="password"
                              type="password"
                              required
                              value={password}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="h-10 w-full rounded-xl bg-muted/30 border border-border text-xs px-3 text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => goToSignupStep(1)}
                              className="px-4 h-10 rounded-xl border border-border text-muted-foreground hover:text-card-foreground text-xs font-semibold cursor-pointer transition-colors"
                            >
                              ← Retour
                            </button>
                            <Button
                              type="submit"
                              disabled={loading}
                              className="flex-1 h-10 font-sans font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all text-xs cursor-pointer shadow-md shadow-primary/20"
                            >
                              {loading ? 'Chargement...' : 'S\'inscrire'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </form>
                  )}

                  {/* Toggle standard/magic auth mode */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (authMode === 'magic-link') {
                          setAuthMode('password');
                        } else {
                          setAuthMode('magic-link');
                        }
                      }}
                      className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
                    >
                      {authMode === 'magic-link' ? 'Se connecter par mot de passe' : 'Se connecter par lien magique'}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Footer Switch */}
          <div className="w-full flex items-center justify-between pt-4 border-t border-border/40 text-xs">
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                setSignupStep(1);
                setAuthMode(authMode === 'signup' ? 'magic-link' : 'signup');
              }}
              className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
            >
              {authMode === 'signup' ? 'Déjà un compte ? Connexion' : "Pas encore de compte ? S'inscrire"}
            </button>
          </div>
        </div>
      </BentoItem>

      {/* Branding Side (Right) */}
      <BentoItem
        active={false}
        flexBasisInactive="45%"
        className="bg-[#EE4B2B] text-white border-0 hidden md:block overflow-hidden"
        inactiveContent={
          <div className="w-full h-full flex flex-col items-start justify-between">
            <Logo className="h-8 w-auto" fillColor="#FFFFFF" />

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
                  <p className="text-white/80 text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
                    Pour les {manifestoMessages[manifestoIdx].target}
                  </p>
                  <h3 className="text-white text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-3 whitespace-pre-line font-sans">
                    {manifestoMessages[manifestoIdx].title}
                  </h3>
                  <p className="text-white/90 text-xs md:text-sm max-w-sm leading-relaxed font-sans">
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
  );
}
