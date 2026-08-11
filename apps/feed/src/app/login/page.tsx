export const dynamic = 'force-dynamic';
import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { getTranslate } from "@qoe/i18n/server"

function LoginFormFallback() {
  return (
    <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto h-[640px] bg-card border border-border p-8 rounded-[36px] shadow-2xl animate-pulse flex">
      <div className="w-[55%] h-full bg-muted rounded-[24px]"></div>
      <div className="w-[45%] h-full bg-[#EE4B2B]/10 rounded-[24px] ml-3"></div>
    </div>
  )
}

export default async function LoginPage() {
  const t = await getTranslate()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
