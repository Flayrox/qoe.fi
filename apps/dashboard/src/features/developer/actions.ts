// =====================================================================
// ⚡ Server Actions — apps/dashboard/src/features/developer/actions.ts
// =====================================================================
// Actions serveur pour gérer les clés d'API et demandes d'accès développeur.
// =====================================================================

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@qoe/db/client"
import { getCurrentUser } from "@qoe/auth/current-user"
import { randomBytes, createHash } from "node:crypto"

/**
 * 🔐 Récupère l'utilisateur connecté ou lève une erreur si non authentifié.
 */
async function authenticateUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Vous devez être connecté pour effectuer cette action.")
  }
  return user
}

/**
 * 📝 Soumet une demande d'accès à l'API Créateur.
 */
export async function submitApiApplicationAction(reason: string) {
  const user = await authenticateUser()

  if (!reason || reason.trim().length < 10) {
    throw new Error("Veuillez fournir une explication détaillée d'au moins 10 caractères.")
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        apiAccessStatus: "pending",
        apiApplicationReason: reason,
      },
    })

    revalidatePath("/developer")
    return { success: true, apiAccessStatus: updatedUser.apiAccessStatus }
  } catch (error: any) {
    console.error("Failed to submit API application:", error)
    throw new Error("Erreur lors de la soumission de la demande. Veuillez réessayer.")
  }
}

/**
 * 🔑 Génère une nouvelle clé d'API pour le créateur approuvé.
 */
export async function generateApiKeyAction(name: string) {
  const user = await authenticateUser()

  // Verify API access approval
  const freshUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { apiAccessStatus: true }
  })

  if (!freshUser || freshUser.apiAccessStatus !== "approved") {
    throw new Error("Votre compte n'est pas approuvé pour l'accès API.")
  }

  if (!name || name.trim().length === 0) {
    throw new Error("Veuillez donner un nom à cette clé d'API.")
  }

  try {
    // Generate secure API key
    // qoe_live_ + 32 chars of secure hex (16 random bytes)
    const randomHex = randomBytes(16).toString("hex")
    const rawKey = `qoe_live_${randomHex}`
    
    // Prefix is first 12 characters (qoe_live_abc)
    const keyPrefix = rawKey.substring(0, 12)
    
    // Hash key for DB storage
    const keyHash = createHash("sha256").update(rawKey).digest("hex")

    const apiKeyRecord = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keyPrefix,
        keyHash,
        userId: user.id,
      },
    })

    revalidatePath("/developer")

    // IMPORTANT: Return rawKey ONLY ONCE here. It will never be accessible again in clear text!
    return {
      success: true,
      rawKey,
      apiKey: {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        keyPrefix: apiKeyRecord.keyPrefix,
        createdAt: apiKeyRecord.createdAt.toISOString(),
        lastUsedAt: apiKeyRecord.lastUsedAt ? apiKeyRecord.lastUsedAt.toISOString() : null,
      }
    }
  } catch (error: any) {
    console.error("Failed to generate API Key:", error)
    throw new Error("Impossible de générer la clé d'API. Veuillez réessayer.")
  }
}

/**
 * ❌ Révoque (supprime) une clé d'API existante.
 */
export async function revokeApiKeyAction(id: string) {
  const user = await authenticateUser()

  try {
    // Delete only if it belongs to the user
    await prisma.apiKey.delete({
      where: {
        id,
        userId: user.id,
      },
    })

    revalidatePath("/developer")
    return { success: true }
  } catch (error: any) {
    console.error("Failed to revoke API key:", error)
    throw new Error("Impossible de révoquer cette clé d'API.")
  }
}
