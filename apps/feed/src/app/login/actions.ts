'use server'

import { createClient } from '@qoe/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = formData.get('redirect') as string
  
  if (!email || !password) {
    redirect('/login?error=Missing+credentials')
  }

  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !user) {
    redirect(`/login?error=${encodeURIComponent(error?.message || 'Authentication failed')}`)
  }

  const { prisma } = await import('@qoe/db/client')
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id }
  })
  if (dbUser) {
    if (dbUser.role === 'user') {
      const followsCount = await prisma.follows.count({ where: { readerId: dbUser.id } })
      const mutedCount = await prisma.mutedWord.count({ where: { userId: dbUser.id } })
      if (followsCount === 0 && mutedCount === 0) {
        redirect('/onboarding')
      }
    }
  }

  redirect(redirectTo || '/home' as any)
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const username = formData.get('username') as string

  if (!email || !password || !name || !username) {
    redirect('/login?error=Missing+fields')
  }

  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        username,
      },
    },
  })

  if (error || !user) {
    redirect(`/login?error=${encodeURIComponent(error?.message || 'Signup failed')}`)
  }

  // Redirect to onboarding for new signups
  redirect('/onboarding')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
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
