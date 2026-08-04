import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@qoe/db/client"
import { SettingsDashboard } from "./SettingsDashboard"

export default async function UserSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Extract real request headers for dynamic session info
  const headersList = await headers()
  const rawUserAgent = headersList.get("user-agent") || "Navigateur Web"
  const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0] || headersList.get("x-real-ip") || "127.0.0.1"

  // Parse user-agent for friendly display
  let browserOs = "Navigateur Web"
  if (rawUserAgent.includes("Chrome")) browserOs = "Chrome"
  else if (rawUserAgent.includes("Safari")) browserOs = "Safari"
  else if (rawUserAgent.includes("Firefox")) browserOs = "Firefox"
  else if (rawUserAgent.includes("Edge")) browserOs = "Edge"

  if (rawUserAgent.includes("Windows")) browserOs += " / Windows"
  else if (rawUserAgent.includes("Mac OS") || rawUserAgent.includes("Macintosh")) browserOs += " / macOS"
  else if (rawUserAgent.includes("iPhone") || rawUserAgent.includes("iPad")) browserOs += " / iOS"
  else if (rawUserAgent.includes("Android")) browserOs += " / Android"
  else if (rawUserAgent.includes("Linux")) browserOs += " / Linux"

  const currentSessionInfo = {
    browserOs,
    ipAddress,
    lastSignInAt: user.last_sign_in_at || new Date().toISOString()
  }

  // Extract real Supabase OAuth connected identities
  const connectedIdentities = (user.identities || []).map((id: any) => ({
    provider: id.provider,
    createdAt: id.created_at,
    lastSignInAt: id.last_sign_in_at
  }))

  // 1. Fetch main user profile
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      logoUrl: true,
      onboardingText: true,
      walletBalanceCents: true,
      subdomain: true
    }
  })

  if (!dbUser) redirect("/login")

  // 2. Fetch followed creators & their subscriber relation (to toggle preferences)
  const followedCreators = await prisma.follows.findMany({
    where: { readerId: user.id },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Fetch all subscriber settings for this user
  const subscriberSettings = await prisma.subscriber.findMany({
    where: { email: dbUser.email }
  })

  // Merge follow + subscription status
  const subscriptions = followedCreators.map((f: any) => {
    const subSetting = subscriberSettings.find((s: any) => s.creatorId === f.creator.id)
    return {
      creator: f.creator,
      receiveArticles: subSetting ? subSetting.receiveArticles : true,
      receivePosts: subSetting ? subSetting.receivePosts : false,
      isPremium: subSetting ? subSetting.isPremium : false
    }
  })

  // 3. Fetch wallet transactions history
  const walletTransactions = await prisma.walletTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // 4. Fetch privacy details (Muted words & Blocked users)
  const mutedWords = await prisma.mutedWord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  })

  const blockedUsers = await prisma.blockedUser.findMany({
    where: { creatorId: user.id },
    include: {
      reader: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // 5. Check if user has a password in auth.users
  let hasPassword = true
  try {
    const authUser = await prisma.$queryRawUnsafe<any[]>(
      `SELECT encrypted_password FROM auth.users WHERE id = $1::uuid`,
      user.id
    )
    if (authUser && authUser.length > 0) {
      hasPassword = !!authUser[0].encrypted_password
    }
  } catch (e) {
    console.error("Failed to check password existence:", e)
  }

  return (
    <SettingsDashboard
      dbUser={dbUser}
      hasPassword={hasPassword}
      currentSessionInfo={currentSessionInfo}
      connectedIdentities={connectedIdentities}
      subscriptions={subscriptions}
      walletTransactions={walletTransactions.map((t: any) => ({
        ...t,
        createdAt: t.createdAt.toISOString()
      }))}
      mutedWords={mutedWords}
      blockedUsers={blockedUsers.map((b: any) => ({
        id: b.id,
        createdAt: b.createdAt.toISOString(),
        user: b.reader
      }))}
    />
  )
}
