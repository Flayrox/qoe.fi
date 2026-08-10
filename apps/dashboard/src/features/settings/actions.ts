"use server"

import {
  updateCreatorProfileAction as rawUpdateCreatorProfile,
  checkSubdomainAvailabilityAction as rawCheckSubdomainAvailability,
  updateSubdomainAction as rawUpdateSubdomain,
  saveNavigationLinksAction as rawSaveNavigationLinks,
  saveSocialLinksAction as rawSaveSocialLinks,
} from "@qoe/api-client/actions/dashboard"

export async function updateCreatorProfileAction(data: Parameters<typeof rawUpdateCreatorProfile>[0]) {
  const res = await rawUpdateCreatorProfile(data)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function checkSubdomainAvailabilityAction(subdomain: string) {
  const res = await rawCheckSubdomainAvailability(subdomain)
  if (!res.ok) return { available: false, error: res.error.message }
  return { available: res.data.available, error: res.data.reason || null }
}

export async function updateSubdomainAction(subdomain: string) {
  const res = await rawUpdateSubdomain(subdomain)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function saveNavigationLinksAction(links: Parameters<typeof rawSaveNavigationLinks>[0]) {
  const res = await rawSaveNavigationLinks(links)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function saveSocialLinksAction(links: Parameters<typeof rawSaveSocialLinks>[0]) {
  const res = await rawSaveSocialLinks(links)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
