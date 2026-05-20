"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export async function updateMediaConfig(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const subdomain = formData.get("subdomain") as string
  const customDomain = formData.get("customDomain") as string
  const accentColor = formData.get("accentColor") as string
  const heroText = formData.get("heroText") as string
  const seoTitle = formData.get("seoTitle") as string
  const seoDescription = formData.get("seoDescription") as string
  const layoutStyle = formData.get("layoutStyle") as string
  const themeMode = formData.get("themeMode") as string

  // Simple validation for subdomain
  if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
    throw new Error("Subdomain can only contain lowercase letters, numbers, and dashes")
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subdomain: subdomain || null,
        customDomain: customDomain || null,
        accentColor: accentColor || null,
        heroText: heroText || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        layoutStyle: layoutStyle || 'minimal',
        themeMode: themeMode || 'system',
      },
    })

    revalidatePath("/dashboard/settings")
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error("This domain or subdomain is already taken.")
    }
    throw new Error("Failed to update media configuration")
  }
}
