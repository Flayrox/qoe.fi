"use server"

import { updateCreatorApiAccessAction as rawUpdateCreatorApiAccess } from "@qoe/api-client/actions/admin"

export async function updateCreatorApiAccessAction(userId: string, status: "approved" | "rejected" | "revoked" | "none") {
  const res = await rawUpdateCreatorApiAccess({ userId, status })
  if (!res.ok) throw new Error(res.error.message)
  return { success: true }
}
