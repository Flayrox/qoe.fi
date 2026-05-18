'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, signup } from './actions'
import { useSearchParams } from 'next/navigation'

export function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="w-full max-w-md p-8 bg-zinc-950 border border-zinc-800 text-white rounded-2xl shadow-2xl shadow-black/80">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-serif italic tracking-tight mb-2 text-white">
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h2>
        <p className="text-zinc-400 text-sm font-sans">
          {mode === 'login' ? 'Accéder à votre infrastructure' : 'Rejoindre la souveraineté des médias'}
        </p>
      </div>

      {error && (
        <div className="p-3 mb-6 bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-mono rounded-lg">
          Erreur: {error}
        </div>
      )}

      <form action={mode === 'login' ? login : signup} className="space-y-4">
        {mode === 'signup' && (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">Nom complet</label>
            <Input
              name="name"
              type="text"
              required
              placeholder="Jean Dupont"
              className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">Adresse email</label>
          <Input
            name="email"
            type="email"
            required
            placeholder="nom@exemple.com"
            className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider font-mono text-zinc-400 block mb-1">Mot de passe</label>
          <Input
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="bg-zinc-900 border-zinc-800 text-white focus-visible:border-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-700 rounded-lg h-10 w-full"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-white text-black hover:bg-zinc-200 transition-all font-sans font-semibold rounded-lg border-none mt-6 cursor-pointer"
        >
          {mode === 'login' ? 'Se connecter' : "S'inscrire"}
        </Button>
      </form>

      <div className="mt-8 text-center border-t border-zinc-900 pt-6">
        <button
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-xs font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  )
}
