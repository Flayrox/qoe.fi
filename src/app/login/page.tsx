import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { getTranslate } from '@/tolgee/server'

function LoginFormFallback() {
  return (
    <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-2xl animate-pulse">
      <div className="h-10 bg-muted rounded-lg mb-6"></div>
      <div className="h-12 bg-muted rounded-lg mb-4"></div>
      <div className="h-12 bg-muted rounded-lg mb-6"></div>
      <div className="h-11 bg-secondary rounded-lg"></div>
    </div>
  )
}

export default async function LoginPage() {
  const t = await getTranslate()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight font-sans text-foreground mb-1">qoe.fi</h1>
        <p className="text-muted-foreground text-xs font-mono">SOVEREIGN MEDIA NETWORK</p>
      </div>
      
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
