'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, signup } from './actions'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@qoe/supabase/client'
import { useTranslate, useTolgee } from "@qoe/i18n"

import { cn } from '@qoe/utils'
import { BentoPlateau, BentoItem } from '@/components/ui/BentoPlateau'
import { Logo } from '@/components/ui/Logo'
import { motion, AnimatePresence } from 'framer-motion'

export function LoginForm() {
  const { t } = useTranslate()
  const tolgee = useTolgee()
  const router = useRouter()
  const [authMode, setAuthMode] = useState<'magic-link' | 'password' | 'signup'>('magic-link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [manifestoIdx, setManifestoIdx] = useState(0)

  // Use Tolgee translations directly inside the component body so they are reactive
  const manifestoMessages = [
    {
      target: t("login.manifesto_creators_target", "Créateurs"),
      title: t("login.manifesto_creators_title", "Reprenez le contrôle \nde votre audience."),
      desc: t("login.manifesto_creators_desc", "Pas de publicités. Pas d'algorithmes opaques. Juste vous et vos lecteurs, sur une infrastructure souveraine."),
    },
    {
      target: t("login.manifesto_readers_target", "Lecteurs"),
      title: t("login.manifesto_readers_title", "Retrouvez le goût \ndu temps long."),
      desc: t("login.manifesto_readers_desc", "Un sanctuaire dédié à la lecture profonde. Fuyez le bruit constant, cultivez le silence et choisissez qui vous influence."),
    }
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setManifestoIdx((prev) => (prev === 0 ? 1 : 0))
    }, 6000)
    return () => clearInterval(interval)
  }, [])
  
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')
  const activeError = localError || errorParam
  
  const currentLanguage = tolgee.getLanguage()

  const handleLanguageChange = async (lang: string) => {
    // TODO i18n: brancher sur @qoe/i18n/setLanguage quand implémenté
    // await setLanguage(lang)
    void lang
    router.refresh()
  }

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

  return (
    <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto animate-in fade-in zoom-in duration-500">
      <BentoPlateau className="md:h-[640px]">
        {/* Auth Side (Left) */}
        <BentoItem 
          active={true} 
          flexBasisActive="55%" 
          innerClassName="bg-card text-card-foreground"
        >
          <div className="w-full h-full flex flex-col items-center justify-center p-8 md:p-12 relative">
            <div className="w-full max-w-md">
              {/* Header */}
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold tracking-tight mb-2">
                  {authMode === 'signup' ? t('login.title_signup', 'Créer un compte') : t('login.title_login', 'Connexion')}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {authMode === 'signup' ? t('login.subtitle_signup', 'Rejoignez le réseau souverain') : t('login.subtitle_login', 'Accédez à votre espace créateur')}
                </p>
              </div>

              {/* Error display */}
              {activeError && (
                <div className="p-3 mb-6 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 font-bold">⚠️</span>
                  <div className="flex-1">{activeError}</div>
                </div>
              )}

              {/* Success screen for Magic Link */}
              {magicLinkSent ? (
                <div className="text-center py-6 space-y-4 animate-in fade-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                    ✓
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-emerald-500">{t('login.magic_link_success', 'Lien magique envoyé')}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed px-4">
                      {t('login.magic_link_success_desc', 'Consultez votre boîte mail et cliquez sur le lien pour vous connecter.')}
                    </p>
                  </div>
                  <Button
                    onClick={() => setMagicLinkSent(false)}
                    variant="outline"
                    className="mt-4 text-xs font-mono"
                  >
                    {t('login.switch_back', 'Retour')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Social Logins - Mini Bento Style */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleOAuth('google')}
                      className="w-full flex items-center p-1.5 rounded-2xl bg-neutral-100/80 hover:bg-neutral-200/60 border border-neutral-200/60 transition-colors group"
                    >
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-neutral-100 group-hover:scale-105 transition-transform shrink-0">
                        <svg className="w-4 h-4 text-neutral-800" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="currentColor" fillOpacity="0.5" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="currentColor" fillOpacity="0.3" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="currentColor" fillOpacity="0.6" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                      </div>
                      <div className="flex-1 flex items-center justify-center pr-2">
                        <span className="text-[12px] font-semibold text-neutral-600 group-hover:text-neutral-900 transition-colors">{t('login.google_btn', 'Google')}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOAuth('apple')}
                      className="w-full flex items-center p-1.5 rounded-2xl bg-neutral-100/80 hover:bg-neutral-200/60 border border-neutral-200/60 transition-colors group"
                    >
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-neutral-100 group-hover:scale-105 transition-transform shrink-0">
                        <svg className="w-5 h-5 text-neutral-800" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z" />
                        </svg>
                      </div>
                      <div className="flex-1 flex items-center justify-center pr-2">
                        <span className="text-[12px] font-semibold text-neutral-600 group-hover:text-neutral-900 transition-colors">{t('login.apple_btn', 'Apple')}</span>
                      </div>
                    </button>
                  </div>

                  {/* Separator */}
                  <div className="flex items-center gap-4 my-6 opacity-60">
                    <div className="flex-1 h-px bg-neutral-200"></div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">{t('login.or_separator', 'Ou')}</span>
                    <div className="flex-1 h-px bg-neutral-200"></div>
                  </div>

                  {/* Interactive Modes */}
                  {authMode === 'magic-link' && (
                    <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-1">{t('login.label_email', 'Email')}</label>
                        <Input
                          type="email"
                          required
                          disabled={loading}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('login.placeholder_email', 'vous@exemple.com')}
                          className="h-11 w-full rounded-xl bg-muted/40 border-border/40 text-xs"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 font-sans font-semibold mt-2 rounded-xl bg-brand hover:opacity-90 text-background transition-all"
                      >
                        {loading ? t('login.loading_state', 'Chargement...') : t('login.button_magic_link', 'Recevoir un lien magique')}
                      </Button>
                    </form>
                  )}

                  {(authMode === 'password' || authMode === 'signup') && (
                    <form action={authMode === 'password' ? login : signup} className="space-y-4">
                      <input type="hidden" name="redirect" value={searchParams.get('redirect') || ''} />
                      {authMode === 'signup' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-xs uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-1">{t('login.label_name', 'Nom complet')}</label>
                            <Input
                              name="name"
                              type="text"
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder={t('login.placeholder_name', 'Marc Dutronc')}
                              className="h-11 w-full rounded-xl bg-muted/40 border-border/40 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-1">{t('login.label_username', 'Nom d\'utilisateur')}</label>
                            <Input
                              name="username"
                              type="text"
                              required
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder={t('login.placeholder_username', '@marcdutronc')}
                              className="h-11 w-full rounded-xl bg-muted/40 border-border/40 text-xs"
                            />
                          </div>
                        </>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-1">{t('login.label_email', 'Email')}</label>
                        <Input
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('login.placeholder_email', 'vous@exemple.com')}
                          className="h-11 w-full rounded-xl bg-muted/40 border-border/40 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-sans font-bold text-muted-foreground block mb-1">{t('login.label_password', 'Mot de passe')}</label>
                        <Input
                          name="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={t('login.placeholder_password', '••••••••')}
                          className="h-11 w-full rounded-xl bg-muted/40 border-border/40 text-xs"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 font-sans font-semibold mt-4 rounded-xl bg-[#EE4B2B] hover:bg-[#d63d20] text-white transition-colors"
                      >
                        {loading ? t('login.loading_state', 'Chargement...') : (authMode === 'password' ? t('login.button_login', 'Se connecter') : t('login.button_signup', 'S\'inscrire'))}
                      </Button>
                    </form>
                  )}

                  {/* Toggle standard/magic auth mode */}
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (authMode === 'magic-link') {
                          setAuthMode('password')
                        } else {
                          setAuthMode('magic-link')
                        }
                      }}
                      className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                      {authMode === 'magic-link' ? t('login.switch_password', 'Se connecter par mot de passe') : t('login.switch_magic_link', 'Se connecter par lien magique')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Switch and Locale */}
            <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
              <button
                onClick={() => {
                  setLocalError(null)
                  setAuthMode(authMode === 'signup' ? 'magic-link' : 'signup')
                }}
                className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                {authMode === 'signup' ? t('login.switch_login', 'Déjà un compte ? Connexion') : t('login.switch_signup', 'Pas de compte ? S\'inscrire')}
              </button>

              <div className="flex gap-1 bg-neutral-100 p-1 rounded-md">
                <button
                  onClick={() => handleLanguageChange('fr')}
                  className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                    currentLanguage === 'fr'
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  FR
                </button>
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                    currentLanguage === 'en'
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </BentoItem>

        {/* Branding Side (Right) */}
        <BentoItem 
          active={false} 
          flexBasisInactive="45%"
          inactiveContent={
            <div className="w-full h-full flex flex-col items-start justify-between">
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
                      {t("login.manifesto_label", "Pour les {target}", { target: manifestoMessages[manifestoIdx].target })}
                    </p>
                    <h3 className="text-white text-3xl font-bold tracking-tight leading-tight mb-4 whitespace-pre-line">
                      {manifestoMessages[manifestoIdx].title}
                    </h3>
                    <p className="text-white/80 text-sm max-w-sm leading-relaxed">
                      {manifestoMessages[manifestoIdx].desc}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          }
        >
          {/* Fallback empty active state (should not happen) */}
          <div />
        </BentoItem>
      </BentoPlateau>
    </div>
  )
}
