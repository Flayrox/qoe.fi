// =====================================================================
// ⚡ Server Actions — apps/dashboard/src/app/(creator)/dashboard/articles/actions.ts
// =====================================================================
// 📖 Actions serveur pour gérer les articles et catégories (CRUD).
//    Sécurisé avec @qoe/auth et connecté à Prisma.
// =====================================================================

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@qoe/db/client"
import { getCurrentUser } from "@qoe/auth/current-user"
import { slugify, shortId } from "@qoe/utils"

/**
 * 🔒 Récupère l'utilisateur connecté ou lève une erreur si non authentifié.
 */
async function authenticateUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Vous devez être connecté pour effectuer cette action.")
  }
  return user
}

// =====================================================================
// 📚 ARTICLES ACTIONS
// =====================================================================

/**
 * 📖 Récupère la liste complète des articles du créateur connecté.
 */
export async function getArticlesAction() {
  const user = await authenticateUser()

  return prisma.article.findMany({
    where: {
      authorId: user.id,
    },
    include: {
      category: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })
}

/**
 * 📖 Récupère un unique article par son ID, s'il appartient au créateur.
 */
export async function getArticleByIdAction(id: string) {
  const user = await authenticateUser()

  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      category: true,
    },
  })

  if (article && article.authorId !== user.id) {
    throw new Error("Vous n'êtes pas autorisé à accéder à cet article.")
  }

  return article
}

/**
 * 📝 Sauvegarde (crée ou met à jour) un article.
 */
export async function saveArticleAction(data: {
  id?: string
  title: string
  content: string
  slug?: string
  published?: boolean
  isPremium?: boolean
  categoryId?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
}) {
  const user = await authenticateUser()

  const {
    id,
    title,
    content,
    slug,
    published = false,
    isPremium = false,
    categoryId = null,
    seoTitle = null,
    seoDescription = null,
  } = data

  // 1. Validation du titre
  if (!title.trim()) {
    throw new Error("Le titre de l'article est requis.")
  }

  // 2. Génération / Validation du slug
  let finalSlug = slugify(slug || title)
  if (!finalSlug) {
    finalSlug = `article-${shortId()}`
  }

  // 3. Vérification de l'unicité globale du slug
  let isSlugTaken = await prisma.article.findFirst({
    where: {
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  })

  // Si le slug est déjà pris, on lui ajoute un suffixe unique
  if (isSlugTaken) {
    finalSlug = `${finalSlug}-${shortId(4)}`
  }

  // Calcul du temps de lecture estimé (environ 200 mots par minute)
  const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  if (id) {
    // Mise à jour de l'article existant
    // Vérification de propriété
    const existing = await prisma.article.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new Error("Article introuvable.")
    }

    if (existing.authorId !== user.id) {
      throw new Error("Vous n'êtes pas autorisé à modifier cet article.")
    }

    const updated = await prisma.article.update({
      where: { id },
      data: {
        title,
        content,
        slug: finalSlug,
        published,
        isPremium,
        readingTime,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    })

    revalidatePath("/dashboard/articles")
    revalidatePath(`/dashboard/articles/${id}`)
    return updated
  } else {
    // Création d'un nouvel article
    const created = await prisma.article.create({
      data: {
        title,
        content,
        slug: finalSlug,
        published,
        isPremium,
        readingTime,
        authorId: user.id,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    })

    revalidatePath("/dashboard/articles")
    return created
  }
}

/**
 * ❌ Supprime un article par son ID.
 */
export async function deleteArticleAction(id: string) {
  const user = await authenticateUser()

  const existing = await prisma.article.findUnique({
    where: { id },
  })

  if (!existing) {
    throw new Error("Article introuvable.")
  }

  if (existing.authorId !== user.id) {
    throw new Error("Vous n'êtes pas autorisé à supprimer cet article.")
  }

  await prisma.article.delete({
    where: { id },
  })

  revalidatePath("/dashboard/articles")
  return { success: true }
}

// =====================================================================
// 📁 CATEGORIES ACTIONS
// =====================================================================

/**
 * 📖 Récupère toutes les catégories créées par le créateur.
 * Inclut le décompte d'articles associés.
 */
export async function getCategoriesAction() {
  const user = await authenticateUser()

  return prisma.category.findMany({
    where: {
      userId: user.id,
    },
    include: {
      _count: {
        select: {
          articles: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  })
}

/**
 * 📝 Crée ou met à jour une catégorie.
 */
export async function saveCategoryAction(data: {
  id?: string
  name: string
  slug?: string
  description?: string | null
}) {
  const user = await authenticateUser()
  const { id, name, slug, description = null } = data

  if (!name.trim()) {
    throw new Error("Le nom de la catégorie est requis.")
  }

  let finalSlug = slugify(slug || name)
  if (!finalSlug) {
    finalSlug = `cat-${shortId()}`
  }

  // Vérification d'unicité du slug POUR CE CRÉATEUR
  const existingWithSlug = await prisma.category.findFirst({
    where: {
      userId: user.id,
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  })

  if (existingWithSlug) {
    throw new Error(`Le slug "${finalSlug}" est déjà utilisé par une autre de vos catégories.`)
  }

  if (id) {
    const existing = await prisma.category.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new Error("Catégorie introuvable.")
    }

    if (existing.userId !== user.id) {
      throw new Error("Vous n'êtes pas autorisé à modifier cette catégorie.")
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug: finalSlug,
        description,
      },
    })

    revalidatePath("/dashboard/articles")
    return updated
  } else {
    const created = await prisma.category.create({
      data: {
        name,
        slug: finalSlug,
        description,
        userId: user.id,
      },
    })

    revalidatePath("/dashboard/articles")
    return created
  }
}

/**
 * ❌ Supprime une catégorie.
 * Met à null la catégorie de tous les articles qui y étaient associés.
 */
export async function deleteCategoryAction(id: string) {
  const user = await authenticateUser()

  const existing = await prisma.category.findUnique({
    where: { id },
  })

  if (!existing) {
    throw new Error("Catégorie introuvable.")
  }

  if (existing.userId !== user.id) {
    throw new Error("Vous n'êtes pas autorisé à supprimer cette catégorie.")
  }

  // Suppression
  await prisma.category.delete({
    where: { id },
  })

  revalidatePath("/dashboard/articles")
  return { success: true }
}
