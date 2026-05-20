"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function saveArticle(
  id: string,
  data: { title: string; content: string; slug: string; published: boolean; isPremium?: boolean }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  try {
    await prisma.article.update({
      where: {
        id,
        authorId: user.id, // Security check
      },
      data: {
        title: data.title,
        content: data.content,
        slug: data.slug,
        published: data.published,
        isPremium: data.isPremium ?? false,
      },
    })

    revalidatePath("/dashboard/articles")
    revalidatePath(`/dashboard/articles/${id}`)
    return { success: true }
  } catch (error: any) {
    console.error("Failed to save article:", error)
    if (error.code === 'P2002') {
      throw new Error("An article with this slug already exists.")
    }
    throw new Error("Failed to save article.")
  }
}

export async function deleteArticle(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  try {
    await prisma.article.delete({
      where: {
        id,
        authorId: user.id, // Security check
      },
    })

    revalidatePath("/dashboard/articles")
  } catch (error) {
    throw new Error("Failed to delete article.")
  }
}

export async function createArticle(data?: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  let newArticle
  try {
    newArticle = await prisma.article.create({
      data: {
        title: data?.title || "",
        content: data?.content || "",
        slug: data?.slug || `draft-${Date.now()}`,
        published: data?.published || false,
        isPremium: data?.isPremium || false,
        authorId: user.id,
      },
    })
  } catch (error) {
    throw new Error("Failed to create article.")
  }

  revalidatePath("/dashboard/articles")
  if (!data) {
    redirect(`/dashboard/articles/${newArticle.id}`)
  } else {
    return newArticle;
  }
}
