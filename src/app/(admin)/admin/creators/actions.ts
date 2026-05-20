"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

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

export async function toggleCertification(creatorId: string) {
  await checkAdmin()

  const creator = await prisma.user.findUnique({
    where: { id: creatorId }
  })

  if (!creator) throw new Error("Creator not found")

  await prisma.user.update({
    where: { id: creatorId },
    data: { isCertified: !creator.isCertified }
  })

  revalidatePath("/admin/creators")
}

export async function toggleShadowban(creatorId: string) {
  await checkAdmin()

  const creator = await prisma.user.findUnique({
    where: { id: creatorId }
  })

  if (!creator) throw new Error("Creator not found")

  await prisma.user.update({
    where: { id: creatorId },
    data: { isShadowbanned: !creator.isShadowbanned }
  })

  revalidatePath("/admin/creators")
}

export async function toggleSuspension(creatorId: string) {
  await checkAdmin()

  const creator = await prisma.user.findUnique({
    where: { id: creatorId }
  })

  if (!creator) throw new Error("Creator not found")

  await prisma.user.update({
    where: { id: creatorId },
    data: { isSuspended: !creator.isSuspended }
  })

  revalidatePath("/admin/creators")
}
