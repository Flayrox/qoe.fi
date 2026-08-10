"use server"

import {
  checkSubdomainAvailabilityAction as rawCheckSubdomain,
  completeOnboardingAction as rawCompleteOnboarding,
} from "@qoe/api-client/actions/dashboard"

export async function checkSubdomainAction(subdomain: string) {
  const res = await rawCheckSubdomain(subdomain)
  if (!res.ok) {
    return { available: false, error: res.error.message }
  }
  return {
    available: res.data.available,
    error: res.data.reason || null,
    suggestions: [],
  }
}

export async function completeOnboardingAction(data: Parameters<typeof rawCompleteOnboarding>[0]) {
  const res = await rawCompleteOnboarding(data)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
