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
import { BentoPlateau, BentoItem } from '@/components/ui/BentoPlateau'
import { Logo } from '@/components/ui/Logo'

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
                  {/* Interactive Modes */}
                  {authMode === 'magic-link' && (
                    <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_email', 'Email')}</label>
                        <Input
                          type="email"
                          required
                          disabled={loading}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('login.placeholder_email', 'vous@exemple.com')}
                          className="h-11 w-full rounded-xl bg-neutral-50/50 border-neutral-200"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 font-sans font-semibold mt-2 rounded-xl bg-[#EE4B2B] hover:bg-[#d63d20] text-white transition-colors"
                      >
                        {loading ? t('login.loading_state', 'Chargement...') : t('login.button_magic_link', 'Recevoir un lien magique')}
                      </Button>
                    </form>
                  )}

                  {(authMode === 'password' || authMode === 'signup') && (
                    <form action={authMode === 'password' ? login : signup} className="space-y-4">
                      {authMode === 'signup' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_name', 'Nom complet')}</label>
                            <Input
                              name="name"
                              type="text"
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder={t('login.placeholder_name', 'Marc Dutronc')}
                              className="h-11 w-full rounded-xl bg-neutral-50/50 border-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_username', 'Nom d\'utilisateur')}</label>
                            <Input
                              name="username"
                              type="text"
                              required
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder={t('login.placeholder_username', '@marcdutronc')}
                              className="h-11 w-full rounded-xl bg-neutral-50/50 border-neutral-200"
                            />
                          </div>
                        </>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_email', 'Email')}</label>
                        <Input
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('login.placeholder_email', 'vous@exemple.com')}
                          className="h-11 w-full rounded-xl bg-neutral-50/50 border-neutral-200"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wider font-mono text-muted-foreground block mb-1">{t('login.label_password', 'Mot de passe')}</label>
                        <Input
                          name="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={t('login.placeholder_password', '••••••••')}
                          className="h-11 w-full rounded-xl bg-neutral-50/50 border-neutral-200"
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
              
              <div className="mt-auto">
                <p className="text-white/50 text-[10px] uppercase tracking-[0.2em] mb-3">Manifeste</p>
                <h3 className="text-white text-3xl font-bold tracking-tight leading-tight mb-4">
                  Reprenez le contrôle <br/> de votre audience.
                </h3>
                <p className="text-white/80 text-sm max-w-sm leading-relaxed">
                  Pas de publicités. Pas d'algorithmes opaques. Juste vous et vos lecteurs, sur une infrastructure souveraine.
                </p>
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
