// =====================================================================
// âš¡ Server Actions â€” apps/dashboard/src/app/(creator)/dashboard/articles/actions.ts
// =====================================================================
// ðŸ“– Actions serveur pour gÃ©rer les articles et catÃ©gories (CRUD).
//    SÃ©curisÃ© avec @qoe/auth et connectÃ© Ã  Prisma.
// =====================================================================

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@qoe/db/client"
import { requireUser } from "@qoe/auth/current-user"
import { slugify, shortId } from "@qoe/utils"
import { searchQueue } from "@/lib/queue"

/**
 * ðŸ”’ RÃ©cupÃ¨re l'utilisateur connectÃ© ou redirige vers la page de connexion.
 */
async function authenticateUser() {
  return await requireUser()
}

// =====================================================================
// ðŸ“š ARTICLES ACTIONS
// =====================================================================

/**
 * ðŸ“– RÃ©cupÃ¨re la liste complÃ¨te des articles du crÃ©ateur connectÃ©.
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
 * ðŸ“– RÃ©cupÃ¨re un unique article par son ID, s'il appartient au crÃ©ateur.
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
    throw new Error("Vous n'Ãªtes pas autorisÃ© Ã  accÃ©der Ã  cet article.")
  }

  return article
}

/**
 * ðŸ“ Sauvegarde (crÃ©e ou met Ã  jour) un article.
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

  // 2. GÃ©nÃ©ration / Validation du slug
  let finalSlug = slugify(slug || title)
  if (!finalSlug) {
    finalSlug = `article-${shortId()}`
  }

  // 3. VÃ©rification de l'unicitÃ© globale du slug
  const isSlugTaken = await prisma.article.findFirst({
    where: {
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  })

  // Si le slug est dÃ©jÃ  pris, on lui ajoute un suffixe unique
  if (isSlugTaken) {
    finalSlug = `${finalSlug}-${shortId(4)}`
  }

  // Calcul du temps de lecture estimÃ© (environ 200 mots par minute)
  const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  if (id) {
    // Mise Ã  jour de l'article existant
    // VÃ©rification de propriÃ©tÃ©
    const existing = await prisma.article.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new Error("Article introuvable.")
    }

    if (existing.authorId !== user.id) {
      throw new Error("Vous n'Ãªtes pas autorisÃ© Ã  modifier cet article.")
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

    revalidatePath("/articles")
    revalidatePath(`/articles/${id}`)

    // Sync Meilisearch
    await searchQueue.add("sync-article", { articleId: id, action: "upsert" })

    return updated
  } else {
    // CrÃ©ation d'un nouvel article
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

    revalidatePath("/articles")

    // Sync Meilisearch
    await searchQueue.add("sync-article", { articleId: created.id, action: "upsert" })

    return created
  }
}

/**
 * âŒ Supprime un article par son ID.
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
    throw new Error("Vous n'Ãªtes pas autorisÃ© Ã  supprimer cet article.")
  }

  await prisma.article.delete({
    where: { id },
  })

  revalidatePath("/articles")

  // Sync Meilisearch
  await searchQueue.add("sync-article", { articleId: id, action: "delete" })

  return { success: true }
}

// =====================================================================
// ðŸ“ CATEGORIES ACTIONS
// =====================================================================

/**
 * ðŸ“– RÃ©cupÃ¨re toutes les catÃ©gories crÃ©Ã©es par le crÃ©ateur.
 * Inclut le dÃ©compte d'articles associÃ©s.
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
 * ðŸ“ CrÃ©e ou met Ã  jour une catÃ©gorie.
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
    throw new Error("Le nom de la catÃ©gorie est requis.")
  }

  let finalSlug = slugify(slug || name)
  if (!finalSlug) {
    finalSlug = `cat-${shortId()}`
  }

  // VÃ©rification d'unicitÃ© du slug POUR CE CRÃ‰ATEUR
  const existingWithSlug = await prisma.category.findFirst({
    where: {
      userId: user.id,
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  })

  if (existingWithSlug) {
    throw new Error(`Le slug "${finalSlug}" est dÃ©jÃ  utilisÃ© par une autre de vos catÃ©gories.`)
  }

  if (id) {
    const existing = await prisma.category.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new Error("CatÃ©gorie introuvable.")
    }

    if (existing.userId !== user.id) {
      throw new Error("Vous n'Ãªtes pas autorisÃ© Ã  modifier cette catÃ©gorie.")
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug: finalSlug,
        description,
      },
    })

    revalidatePath("/articles")
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

    revalidatePath("/articles")
    return created
  }
}

/**
 * âŒ Supprime une catÃ©gorie.
 * Met Ã  null la catÃ©gorie de tous les articles qui y Ã©taient associÃ©s.
 */
export async function deleteCategoryAction(id: string) {
  const user = await authenticateUser()

  const existing = await prisma.category.findUnique({
    where: { id },
  })

  if (!existing) {
    throw new Error("CatÃ©gorie introuvable.")
  }

  if (existing.userId !== user.id) {
    throw new Error("Vous n'Ãªtes pas autorisÃ© Ã  supprimer cette catÃ©gorie.")
  }

  // Suppression
  await prisma.category.delete({
    where: { id },
  })

  revalidatePath("/articles")
  return { success: true }
}
