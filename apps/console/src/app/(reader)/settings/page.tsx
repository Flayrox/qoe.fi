import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { SettingsDashboard } from "./SettingsDashboard"

export default async function UserSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

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

  return (
    <SettingsDashboard
      dbUser={dbUser}
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
