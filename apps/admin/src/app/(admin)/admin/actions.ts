"use server"

import {
  setSystemConfigAction,
  deleteSystemConfigAction,
  suspendUserAction,
  unsuspendUserAction,
  toggleUserCertificationAction,
  toggleUserShadowbanAction,
  updateCreatorApiAccessAction as rawUpdateCreatorApiAccess,
} from "@qoe/api-client/actions/admin"

export async function setSystemConfig(key: string, value: string, description?: string) {
  const res = await setSystemConfigAction({ key, value, description })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function deleteSystemConfig(key: string) {
  const res = await deleteSystemConfigAction(key)
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function suspendUser(userId: string, reason: string) {
  const res = await suspendUserAction({ userId, reason })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function unsuspendUser(userId: string) {
  const res = await unsuspendUserAction(userId)
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function toggleUserCertification(userId: string, isCertified: boolean) {
  const res = await toggleUserCertificationAction({ userId, isCertified })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function toggleUserShadowban(userId: string, isShadowbanned: boolean) {
  const res = await toggleUserShadowbanAction({ userId, isShadowbanned })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function updateCreatorApiAccess(userId: string, status: "approved" | "rejected" | "revoked" | "none") {
  const res = await rawUpdateCreatorApiAccess({ userId, status })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}

export async function updateCreatorApiAccessAction(userId: string, status: "approved" | "rejected" | "revoked" | "none") {
  return updateCreatorApiAccess(userId, status)
}

export async function saveTranslationOverrides(overrides: any, changesSummaryList?: any) {
  const res = await setSystemConfigAction({
    key: "TRANSLATION_OVERRIDES",
    value: typeof overrides === "string" ? overrides : JSON.stringify(overrides),
    description: "System translation overrides",
  })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}
