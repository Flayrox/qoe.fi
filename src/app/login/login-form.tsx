'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, signup } from './actions'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTranslate, useTolgee } from '@tolgee/react'
import { setLanguage } from '@/tolgee/language'
import { cn } from '@/lib/utils'

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
  
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')
  const activeError = localError || errorParam
  
  const currentLanguage = tolgee.getLanguage()

  const handleLanguageChange = async (lang: string) => {
    await setLanguage(lang)
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
    } catch (err: any) {
      setLocalError(err.message)
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
    } catch (err: any) {
      setLocalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md p-8 bg-card/80 backdrop-blur-xl border border-border text-card-foreground rounded-2xl shadow-2xl transition-all duration-300">
      
      {/* Header */}
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-serif italic tracking-tight mb-2">
          {authMode === 'signup' ? t('login.title_signup') : t('login.title_login')}
        </h2>
        <p className="text-muted-foreground text-sm font-sans">
          {authMode === 'signup' ? t('login.subtitle_signup') : t('login.subtitle_login')}
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
            <h3 className="text-lg font-serif italic text-emerald-500">{t('login.magic_link_success')}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed px-4">
              {t('login.magic_link_success_desc')}
            </p>
          </div>
          <Button
            onClick={() => setMagicLinkSent(false)}
            variant="outline"
            className="mt-4 text-xs font-mono"
          >
            {t('login.switch_back')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Social Logins */}
          <div className="grid grid-cols-1 gap-3">
            {/* Google Button — Disabled until Supabase provider is configured */}
            <button
              type="button"
              disabled
              className="w-full h-11 bg-secondary/50 border border-border/50 text-muted-foreground font-sans font-medium rounded-lg flex items-center justify-center gap-3 cursor-not-allowed opacity-60 relative"
              title={t('login.oauth_coming_soon')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" fillOpacity="0.5" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" fillOpacity="0.3" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="currentColor" fillOpacity="0.6" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{t('login.google_btn')}</span>
              <span className="absolute right-3 text-[9px] font-mono uppercase tracking-widest opacity-60 bg-muted px-1.5 py-0.5 rounded-full">{t('login.oauth_coming_soon')}</span>
            </button>

            {/* Apple Button — Disabled until Supabase provider is configured */}
            <button
              type="button"
              disabled
              className="w-full h-11 bg-secondary/50 border border-border/50 text-muted-foreground font-sans font-medium rounded-lg flex items-center justify-center gap-3 cursor-not-allowed opacity-60 relative"
              title={t('login.oauth_coming_soon')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z" />
              </svg>
              <span>{t('login.apple_btn')}</span>
              <span className="absolute right-3 text-[9px] font-mono uppercase tracking-widest opacity-60 bg-muted px-1.5 py-0.5 rounded-full">{t('login.oauth_coming_soon')}</span>
            </button>
          </div>

          {/* Separator */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">{t('login.or_separator')}</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          {/* Interactive Modes */}
          {authMode === 'magic-link' && (
            <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_email')}</label>
                <Input
                  type="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.placeholder_email')}
                  className="h-10 w-full"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-sans font-semibold mt-2 cursor-pointer"
              >
                {loading ? t('login.loading_state') : t('login.button_magic_link')}
              </Button>
            </form>
          )}

          {(authMode === 'password' || authMode === 'signup') && (
            <form action={authMode === 'password' ? login : signup} className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_name')}</label>
                    <Input
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('login.placeholder_name')}
                      className="h-10 w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_username')}</label>
                    <Input
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('login.placeholder_username')}
                      className="h-10 w-full"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_email')}</label>
                <Input
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.placeholder_email')}
                  className="h-10 w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_password')}</label>
                <Input
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.placeholder_password')}
                  className="h-10 w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-sans font-semibold mt-4 cursor-pointer"
              >
                {loading ? t('login.loading_state') : (authMode === 'password' ? t('login.button_login') : t('login.button_signup'))}
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
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {authMode === 'magic-link' ? t('login.switch_password') : t('login.switch_magic_link')}
            </button>
          </div>
        </div>
      )}

      {/* Footer Switch and Locale */}
      <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
        <button
          onClick={() => {
            setLocalError(null)
            setAuthMode(authMode === 'signup' ? 'magic-link' : 'signup')
          }}
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {authMode === 'signup' ? t('login.switch_login') : t('login.switch_signup')}
        </button>

        <div className="flex gap-1">
          <button
            onClick={() => handleLanguageChange('fr')}
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
              currentLanguage === 'fr'
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
          >
            FR
          </button>
          <button
            onClick={() => handleLanguageChange('en')}
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
              currentLanguage === 'en'
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
          >
            EN
          </button>
        </div>
      </div>
    </div>
  )
}
