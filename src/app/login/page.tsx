import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { getDictionary } from '@/lib/i18n'

function LoginFormFallback() {
  return (
    <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-8 rounded-2xl shadow-2xl animate-pulse">
      <div className="h-10 bg-zinc-900 rounded-lg mb-6"></div>
      <div className="h-12 bg-zinc-900 rounded-lg mb-4"></div>
      <div className="h-12 bg-zinc-900 rounded-lg mb-6"></div>
      <div className="h-11 bg-zinc-800 rounded-lg"></div>
    </div>
  )
}

export default async function LoginPage() {
  const dict = await getDictionary()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black px-4 py-12">
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight font-sans text-white mb-1">qoe.fi</h1>
        <p className="text-zinc-500 text-xs font-mono">SOVEREIGN MEDIA NETWORK</p>
      </div>
      
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm t={dict.login} />
      </Suspense>
    </main>
  )
}
