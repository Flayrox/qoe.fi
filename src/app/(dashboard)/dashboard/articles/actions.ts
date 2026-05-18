'use server'

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createArticleAction(data: {
  title: string
  content: string
  slug: string
  published: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  // Ensure slug uniqueness
  const existing = await prisma.article.findUnique({
    where: { slug: data.slug }
  })
  if (existing) {
    throw new Error("An article with this slug already exists.")
  }

  const article = await prisma.article.create({
    data: {
      title: data.title,
      content: data.content,
      slug: data.slug,
      published: data.published,
      authorId: user.id
    }
  })

  revalidatePath('/dashboard/articles')
  revalidatePath('/dashboard')
  return article
}

export async function updateArticleAction(id: string, data: {
  title: string
  content: string
  slug: string
  published: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  // Verify ownership
  const article = await prisma.article.findUnique({
    where: { id }
  })

  if (!article || article.authorId !== user.id) {
    throw new Error("Forbidden or article not found")
  }

  // Verify slug uniqueness if slug changed
  if (article.slug !== data.slug) {
    const existing = await prisma.article.findUnique({
      where: { slug: data.slug }
    })
    if (existing) {
      throw new Error("An article with this slug already exists.")
    }
  }

  const updated = await prisma.article.update({
    where: { id },
    data: {
      title: data.title,
      content: data.content,
      slug: data.slug,
      published: data.published
    }
  })

  revalidatePath('/dashboard/articles')
  revalidatePath(`/dashboard/articles/${id}`)
  revalidatePath('/dashboard')
  return updated
}

export async function deleteArticleAction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  // Verify ownership
  const article = await prisma.article.findUnique({
    where: { id }
  })

  if (!article || article.authorId !== user.id) {
    throw new Error("Forbidden or article not found")
  }

  await prisma.article.delete({
    where: { id }
  })

  revalidatePath('/dashboard/articles')
  revalidatePath('/dashboard')
}
