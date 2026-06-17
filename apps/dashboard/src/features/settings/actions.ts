// =====================================================================
// ⚡ Server Actions — apps/dashboard/src/features/settings/actions.ts
// =====================================================================
// Actions serveur pour gérer les paramètres du créateur (profil, sous-domaine, liens).
// Sécurisé avec @qoe/auth et connecté à Prisma.
// =====================================================================

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@qoe/db/client"
import { getCurrentUser } from "@qoe/auth/current-user"

// Liste des mots réservés interdits comme sous-domaines créateur
const RESERVED_SUBDOMAINS = [
  "admin",
  "dashboard",
  "api",
  "feed",
  "landing",
  "auth",
  "login",
  "register",
  "www",
  "support",
  "static",
  "qoe",
  "qoefi",
  "mail",
  "assets",
  "blog",
  "help",
  "dev",
  "test",
  "status",
]

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
 * 📝 Met à jour les paramètres généraux de profil du créateur.
 */
export async function updateCreatorProfileAction(data: {
  name?: string | null
  heroText?: string | null
  accentColor?: string | null
  fontFamily?: string | null
  themeMode?: string | null
  layoutStyle?: string | null
  logoUrl?: string | null
  headerImageUrl?: string | null
  footerText?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  allowIndexing?: boolean
  supportUrl?: string | null
}) {
  const user = await authenticateUser()

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: data.name,
      heroText: data.heroText,
      accentColor: data.accentColor,
      fontFamily: data.fontFamily,
      themeMode: data.themeMode,
      layoutStyle: data.layoutStyle,
      logoUrl: data.logoUrl,
      headerImageUrl: data.headerImageUrl,
      footerText: data.footerText,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      allowIndexing: data.allowIndexing,
      supportUrl: data.supportUrl,
    },
  })

  revalidatePath("/dashboard/settings")
  return updatedUser
}

/**
 * 🔍 Vérifie la validité et la disponibilité d'un sous-domaine.
 */
export async function checkSubdomainAvailabilityAction(subdomain: string) {
  const user = await authenticateUser()
  const cleanSubdomain = subdomain.trim().toLowerCase()

  // 1. Validation de la regex (uniquement lettres minuscules, chiffres, et tirets)
  const subdomainRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!subdomainRegex.test(cleanSubdomain)) {
    return {
      available: false,
      error: "Le sous-domaine ne doit contenir que des lettres minuscules, des chiffres ou des tirets (sans espaces).",
    }
  }

  // 2. Validation de la longueur
  if (cleanSubdomain.length < 3 || cleanSubdomain.length > 30) {
    return {
      available: false,
      error: "Le sous-domaine doit faire entre 3 et 30 caractères.",
    }
  }

  // 3. Validation des sous-domaines réservés
  if (RESERVED_SUBDOMAINS.includes(cleanSubdomain)) {
    return {
      available: false,
      error: "Ce sous-domaine est réservé par le système.",
    }
  }

  // 4. Recherche dans la base de données
  const existingUser = await prisma.user.findFirst({
    where: { subdomain: cleanSubdomain },
  })

  if (existingUser && existingUser.id !== user.id) {
    return {
      available: false,
      error: "Ce sous-domaine est déjà pris par un autre créateur.",
    }
  }

  return {
    available: true,
    error: null,
  }
}

/**
 * 🔒 Assigne un sous-domaine unique et propre au créateur connecté.
 */
export async function updateSubdomainAction(subdomain: string) {
  const user = await authenticateUser()
  const cleanSubdomain = subdomain.trim().toLowerCase()

  const check = await checkSubdomainAvailabilityAction(cleanSubdomain)
  if (!check.available) {
    throw new Error(check.error || "Sous-domaine invalide ou indisponible.")
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      subdomain: cleanSubdomain || null,
    },
  })

  revalidatePath("/dashboard/settings")
  return updatedUser
}

/**
 * 🔗 Synchronise et enregistre en une transaction les liens de navigation du créateur.
 */
export async function saveNavigationLinksAction(
  links: Array<{
    id?: string
    label: string
    url: string | null
    order: number
    isExternal: boolean
  }>
) {
  const user = await authenticateUser()

  await prisma.$transaction(async (tx) => {
    // 1. Supprime les liens existants qui ne sont plus présents dans la liste envoyée
    const payloadIds = links.filter((l) => l.id).map((l) => l.id as string)
    await tx.navigationItem.deleteMany({
      where: {
        userId: user.id,
        id: { notIn: payloadIds },
      },
    })

    // 2. Met à jour les liens existants et crée les nouveaux
    for (const link of links) {
      if (link.id) {
        await tx.navigationItem.update({
          where: { id: link.id },
          data: {
            label: link.label,
            url: link.url,
            order: link.order,
            isExternal: link.isExternal,
          },
        })
      } else {
        await tx.navigationItem.create({
          data: {
            label: link.label,
            url: link.url,
            order: link.order,
            isExternal: link.isExternal,
            userId: user.id,
          },
        })
      }
    }
  })

  revalidatePath("/dashboard/settings")
  return { success: true }
}

/**
 * 📱 Synchronise et enregistre en une transaction les liens de réseaux sociaux du créateur.
 */
export async function saveSocialLinksAction(
  links: Array<{
    id?: string
    platform: string
    url: string
    order: number
  }>
) {
  const user = await authenticateUser()

  await prisma.$transaction(async (tx) => {
    // 1. Supprime les liens sociaux existants qui ne sont plus présents dans le payload
    const payloadIds = links.filter((l) => l.id).map((l) => l.id as string)
    await tx.socialLink.deleteMany({
      where: {
        userId: user.id,
        id: { notIn: payloadIds },
      },
    })

    // 2. Met à jour les liens sociaux existants et crée les nouveaux
    for (const link of links) {
      if (link.id) {
        await tx.socialLink.update({
          where: { id: link.id },
          data: {
            platform: link.platform,
            url: link.url,
            order: link.order,
          },
        })
      } else {
        await tx.socialLink.create({
          data: {
            platform: link.platform,
            url: link.url,
            order: link.order,
            userId: user.id,
          },
        })
      }
    }
  })

  revalidatePath("/dashboard/settings")
  return { success: true }
}

// =====================================================================
// 📝 STUDIO ARTICLES ACTIONS
// =====================================================================

/**
 * 📝 Crée un brouillon d'article vide directement depuis le Studio.
 */
export async function createStudioArticleAction() {
  const user = await authenticateUser()
  const tempId = Math.random().toString(36).substring(2, 9)
  const slug = `draft-${tempId}`

  const newArticle = await prisma.article.create({
    data: {
      title: "Article Sans Titre",
      slug,
      content: "Commencez à écrire votre article ici...",
      authorId: user.id,
      published: false,
    },
  })

  revalidatePath("/dashboard/settings")
  return newArticle
}

/**
 * 📝 Met à jour les détails ou le contenu d'un article depuis le Studio.
 */
export async function updateStudioArticleAction(
  id: string,
  data: {
    title?: string
    content?: string
    slug?: string
    categoryId?: string | null
    published?: boolean
    isPremium?: boolean
    seoTitle?: string | null
    seoDescription?: string | null
  }
) {
  const user = await authenticateUser()

  const updatedArticle = await prisma.article.update({
    where: {
      id,
      authorId: user.id, // Garde de sécurité : l'article doit appartenir au créateur
    },
    data: {
      title: data.title,
      content: data.content,
      slug: data.slug,
      categoryId: data.categoryId,
      published: data.published,
      isPremium: data.isPremium,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    },
  })

  revalidatePath("/dashboard/settings")
  return updatedArticle
}

/**
 * 📝 Supprime un article ou brouillon depuis le Studio.
 */
export async function deleteStudioArticleAction(id: string) {
  const user = await authenticateUser()

  await prisma.article.delete({
    where: {
      id,
      authorId: user.id, // Garde de sécurité
    },
  })

  revalidatePath("/dashboard/settings")
  return { success: true }
}

