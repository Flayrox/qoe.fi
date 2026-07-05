"use server"

import { createClient as createServerClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { revalidatePath } from "next/cache"

async function verifySuperadmin() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error("Unauthorized")

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } })
  if (dbUser?.role !== "superadmin") throw new Error("Forbidden")
  
  return dbUser
}

/**
 * 📝 Met à jour le statut d'accès à l'API d'un créateur (approbation / rejet / révocation).
 */
export async function updateCreatorApiAccessAction(userId: string, status: "approved" | "rejected" | "revoked" | "none") {
  await verifySuperadmin()

  if (!userId) {
    throw new Error("ID de l'utilisateur requis.")
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        apiAccessStatus: status,
      },
    })

    revalidatePath("/admin/api")
    return { success: true }
  } catch (error: any) {
    console.error("Failed to update creator API access status:", error)
    throw new Error("Impossible de mettre à jour l'accès API. Veuillez réessayer.")
  }
}
