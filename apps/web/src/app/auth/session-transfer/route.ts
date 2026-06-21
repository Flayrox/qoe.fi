import { NextResponse } from 'next/server'
import { createClient } from '@qoe/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accessToken = searchParams.get('access_token')
  const refreshToken = searchParams.get('refresh_token')
  const redirectUrl = searchParams.get('redirect') || '/'

  if (accessToken && refreshToken) {
    const supabase = await createClient()
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
  }

  return NextResponse.redirect(redirectUrl)
}
