"use server"

import {
  submitApiApplicationAction as rawSubmitApiApplication,
  generateApiKeyAction as rawGenerateApiKey,
  revokeApiKeyAction as rawRevokeApiKey,
} from "@qoe/api-client/actions/dashboard"

export async function submitApiApplicationAction(reason: string) {
  const res = await rawSubmitApiApplication(reason)
  if (!res.ok) throw new Error(res.error.message)
  return { success: true, apiAccessStatus: "pending" }
}

export async function generateApiKeyAction(name: string) {
  const res = await rawGenerateApiKey(name)
  if (!res.ok) throw new Error(res.error.message)
  return { success: true, apiKey: res.data.apiKey, rawKey: res.data.apiKey }
}

export async function revokeApiKeyAction(id: string) {
  const res = await rawRevokeApiKey(id)
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}
