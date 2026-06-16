'use server'

import { createClient } from '@qoe/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi'
  redirect(`${appUrl}/login`)
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { prisma } = await import('@qoe/db/client')
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subdomain: true,
      customDomain: true,
    }
  })
  return dbUser
}
