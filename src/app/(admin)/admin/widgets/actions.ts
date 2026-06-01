"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// ── Article à la une ──────────────────────────────────────────────────────────
export async function toggleFeaturedArticle(articleId: string) {
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { isEditorPick: true }
    })
    
    if (!article) return { success: false, error: "Article non trouvé" }
    
    const nextVal = !article.isEditorPick
    
    if (nextVal) {
      // Décocher tous les autres articles à la une
      await prisma.article.updateMany({
        where: { isEditorPick: true },
        data: { isEditorPick: false }
      })
    }
    
    await prisma.article.update({
      where: { id: articleId },
      data: { isEditorPick: nextVal }
    })
    
    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message || "Erreur de base de données" }
  }
}

// ── Tendances ────────────────────────────────────────────────────────────────
export async function addTrend(hashtag: string, count: number) {
  try {
    if (!hashtag.startsWith("#")) {
      hashtag = "#" + hashtag.trim()
    } else {
      hashtag = hashtag.trim()
    }
    
    if (hashtag.length < 2) {
      return { success: false, error: "Hashtag invalide" }
    }

    await prisma.trend.upsert({
      where: { hashtag },
      update: { count },
      create: { hashtag, count }
    })

    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message || "Erreur lors de la création" }
  }
}

export async function deleteTrend(id: string) {
  try {
    await prisma.trend.delete({ where: { id } })
    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message }
  }
}

export async function updateTrendCount(id: string, count: number) {
  try {
    await prisma.trend.update({
      where: { id },
      data: { count }
    })
    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message }
  }
}

// ── Publicités & Partenaires ─────────────────────────────────────────────────
export async function savePromo(
  id: string | null,
  title: string,
  description: string,
  ctaText: string | null,
  ctaUrl: string | null,
  isActive: boolean
) {
  try {
    if (!title || !description) {
      return { success: false, error: "Titre et description requis" }
    }

    if (id) {
      await prisma.partnerPromo.update({
        where: { id },
        data: { title, description, ctaText, ctaUrl, isActive }
      })
    } else {
      await prisma.partnerPromo.create({
        data: { title, description, ctaText, ctaUrl, isActive }
      })
    }

    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message }
  }
}

export async function deletePromo(id: string) {
  try {
    await prisma.partnerPromo.delete({ where: { id } })
    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message }
  }
}

export async function togglePromoActive(id: string, isActive: boolean) {
  try {
    await prisma.partnerPromo.update({
      where: { id },
      data: { isActive }
    })
    revalidatePath("/admin/widgets")
    revalidatePath("/home")
    return { success: true }
  } catch (error: any) {
    console.error(error)
    return { success: false, error: error.message }
  }
}
