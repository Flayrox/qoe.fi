"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    throw new Error("Unauthorized")
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  if (user?.role !== 'superadmin') {
    throw new Error("Unauthorized")
  }
}

export async function saveConfig(key: string, value: string, description?: string) {
  await checkAdmin()

  const trimmedKey = key.trim().toUpperCase()
  if (!trimmedKey) throw new Error("Key cannot be empty")

  await prisma.systemConfig.upsert({
    where: { key: trimmedKey },
    update: { 
      value: value.trim(),
      ...(description !== undefined && { description: description.trim() })
    },
    create: {
      key: trimmedKey,
      value: value.trim(),
      description: description?.trim() || null
    }
  })

  revalidatePath("/admin/config")
}

export async function deleteConfig(key: string) {
  await checkAdmin()

  await prisma.systemConfig.delete({
    where: { key }
  })

  revalidatePath("/admin/config")
}
