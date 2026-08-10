'use server'

import { redirect } from 'next/navigation'
import { getMonorepoUrl } from '@qoe/config'
import { logoutAction, getCurrentUserAction } from '@qoe/api-client/actions/auth'

export async function logout() {
  await logoutAction()
  const loginUrl = `${getMonorepoUrl("feed")}/login`
  redirect(loginUrl)
}

export async function getCurrentUser() {
  return getCurrentUserAction()
}
