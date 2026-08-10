"use server"

import { setSystemConfigAction, deleteSystemConfigAction } from "@qoe/api-client/actions/admin"

export async function saveConfig(key: string, value: string, description?: string) {
  const res = await setSystemConfigAction({ key: key.trim().toUpperCase(), value: value.trim(), description: description?.trim() })
  if (!res.ok) throw new Error(res.error.message)
}

export async function deleteConfig(key: string) {
  const res = await deleteSystemConfigAction(key)
  if (!res.ok) throw new Error(res.error.message)
}
