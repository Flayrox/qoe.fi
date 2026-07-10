"use server"

import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { revalidatePath, revalidateTag } from "next/cache"

// Create a Supabase admin client to bypass RLS and manage auth users
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

async function verifySuperadmin() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error("Unauthorized")

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } })
  if (dbUser?.role !== "superadmin") throw new Error("Forbidden")
  
  return dbUser
}

/**
 * ----------------------------------------------------
 * CONFIGURATION & FEATURE FLAGS
 * ----------------------------------------------------
 */

export async function setSystemConfig(key: string, value: string, description?: string) {
  await verifySuperadmin()

  await prisma.systemConfig.upsert({
    where: { key },
    update: { value, description },
    create: { key, value, description },
  })

  revalidatePath("/", "layout")
  return { success: true }
}

export async function deleteSystemConfig(key: string) {
  await verifySuperadmin()

  await prisma.systemConfig.delete({
    where: { key },
  })

  revalidatePath("/", "layout")
  return { success: true }
}

/**
 * ----------------------------------------------------
 * USER MODERATION
 * ----------------------------------------------------
 */

export async function suspendUser(userId: string, reason: string) {
  await verifySuperadmin()

  // 1. Update Database
  await prisma.user.update({
    where: { id: userId },
    data: { 
      isSuspended: true,
      suspendReason: reason,
    }
  })

  // 2. Ban in Supabase Auth (Revokes session access)
  const adminClient = getAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h' // Banned for 100 years
  })

  if (error) {
    console.error("Failed to ban user in Supabase Auth:", error)
    throw new Error("User suspended in DB, but failed to ban in Auth.")
  }

  revalidatePath("/admin/creators")
  return { success: true }
}

export async function unsuspendUser(userId: string) {
  await verifySuperadmin()

  // 1. Update Database
  await prisma.user.update({
    where: { id: userId },
    data: { 
      isSuspended: false,
      suspendReason: null,
    }
  })

  // 2. Unban in Supabase Auth
  const adminClient = getAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none'
  })

  if (error) {
    console.error("Failed to unban user in Supabase Auth:", error)
    throw new Error("User unsuspended in DB, but failed to unban in Auth.")
  }

  revalidatePath("/admin/creators")
  return { success: true }
}

export async function toggleUserCertification(userId: string, isCertified: boolean) {
  await verifySuperadmin()

  await prisma.user.update({
    where: { id: userId },
    data: { isCertified }
  })

  revalidatePath("/admin/creators")
  return { success: true }
}

export async function toggleUserShadowban(userId: string, isShadowbanned: boolean) {
  await verifySuperadmin()

  await prisma.user.update({
    where: { id: userId },
    data: { isShadowbanned }
  })

  revalidatePath("/admin/creators")
  return { success: true }
}

export async function saveTranslationOverrides(
  overrides: Record<string, any>,
  changesSummaryList?: Array<{ key: string; lang: string; oldValue: string | null; newValue: string | null }>
) {
  const admin = await verifySuperadmin()

  await prisma.systemConfig.upsert({
    where: { key: "TRANSLATIONS_OVERRIDE" },
    update: { value: JSON.stringify(overrides) },
    create: {
      key: "TRANSLATIONS_OVERRIDE",
      value: JSON.stringify(overrides),
      description: "Translation overrides for dynamic i18n"
    }
  });

  // Bulk log translation edits into DB for audit
  if (changesSummaryList && changesSummaryList.length > 0) {
    try {
      await prisma.translationAuditLog.createMany({
        data: changesSummaryList.map(change => ({
          key: change.key,
          lang: change.lang,
          oldValue: change.oldValue,
          newValue: change.newValue,
          authorId: admin.id
        }))
      });
    } catch (e) {
      console.error("Failed to create translation audit logs:", e);
    }
  }

  (revalidateTag as any)("i18n-overrides");
  revalidatePath("/", "layout");
  return { success: true }
}
