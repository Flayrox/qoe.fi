'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, signup } from './actions'
import { useSearchParams } from 'next/navigation'

export function LoginForm({ t }: { t?: any }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const l = t || {
    title_login: "Connexion",
    title_signup: "Créer un compte",
    subtitle_login: "Accéder à votre infrastructure",
    subtitle_signup: "Rejoindre la souveraineté des médias",
    label_name: "Nom complet",
    placeholder_name: "Jean Dupont",
    label_username: "Nom d'utilisateur (Username)",
    placeholder_username: "jeandupont",
    label_email: "Adresse email",
    placeholder_email: "nom@exemple.com",
    label_password: "Mot de passe",
    placeholder_password: "••••••••",
    button_login: "Se connecter",
    button_signup: "S'inscrire",
    switch_signup: "Pas encore de compte ? S'inscrire",
    switch_login: "Déjà un compte ? Se connecter"
  }

  const changeLocale = (locale: 'fr' | 'en') => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
    window.location.reload()
  }

  return (
    <div className="w-full max-w-md p-8 bg-zinc-950 border border-zinc-800 text-white rounded-2xl shadow-2xl shadow-black/80">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-serif italic tracking-tight mb-2 text-white">
          {mode === 'login' ? l.title_login : l.title_signup}
        </h2>
        <p className="text-zinc-400 text-sm font-sans">
          {mode === 'login' ? l.subtitle_login : l.subtitle_signup}
        </p>
      </div>

      {error && (
        <div className="p-3 mb-6 bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-mono rounded-lg">
          Erreur: {error}
        </div>
      )}

      <form action={mode === 'login' ? login : signup} className="space-y-4">
        {mode === 'signup' && (
          <>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">{l.label_name}</label>
              <Input
                name="name"
                type="text"
                required
                placeholder={l.placeholder_name}
                className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">{l.label_username}</label>
              <Input
                name="username"
                type="text"
                required
                placeholder={l.placeholder_username}
                className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">{l.label_email}</label>
          <Input
            name="email"
            type="email"
            required
            placeholder={l.placeholder_email}
            className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">{l.label_password}</label>
          <Input
            name="password"
            type="password"
            required
            placeholder={l.placeholder_password}
            className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-white text-black hover:bg-zinc-200 transition-all font-sans font-semibold rounded-lg border-none mt-6 cursor-pointer"
        >
          {mode === 'login' ? l.button_login : l.button_signup}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-zinc-900 flex items-center justify-between">
        <button
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-xs font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          {mode === 'login' ? l.switch_signup : l.switch_login}
        </button>

        <div className="flex gap-1">
          <button
            onClick={() => changeLocale('fr')}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer text-zinc-400"
          >
            FR
          </button>
          <button
            onClick={() => changeLocale('en')}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer text-zinc-400"
          >
            EN
          </button>
        </div>
      </div>
    </div>
  )
}
