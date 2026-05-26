import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/home'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { prisma } = await import('@/lib/db')
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id }
        })

        if (dbUser) {
          if (dbUser.role === 'user') {
            const followsCount = await prisma.follows.count({ where: { readerId: dbUser.id } })
            const mutedCount = await prisma.mutedWord.count({ where: { userId: dbUser.id } })
            if (followsCount === 0 && mutedCount === 0) {
              next = '/onboarding'
            } else {
              next = '/home'
            }
          } else {
            next = '/home'
          }
        } else {
          next = '/onboarding'
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
