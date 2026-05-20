import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { OnboardingFlow } from "./OnboardingFlow"

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if they already have follows or muted words, which means they might have completed onboarding
  const followsCount = await prisma.follows.count({ where: { readerId: user.id } })
  const mutedCount = await prisma.mutedWord.count({ where: { userId: user.id } })

  if (followsCount > 0 || mutedCount > 0) {
    // Already onboarded
    redirect("/")
  }

  // Get available categories for interests
  const uniqueCategories = await prisma.category.findMany({
    distinct: ['slug'],
    select: { id: true, name: true, slug: true },
    take: 20
  })

  // Get some certified creators to suggest
  const suggestedCreators = await prisma.user.findMany({
    where: { 
      role: 'creator',
      isCertified: true 
    },
    select: { id: true, name: true, subdomain: true, logoUrl: true, heroText: true },
    take: 5
  })

  // Fallback if no certified creators exist yet (for dev)
  const creators = suggestedCreators.length > 0 ? suggestedCreators : await prisma.user.findMany({
    where: { role: 'creator' },
    select: { id: true, name: true, subdomain: true, logoUrl: true, heroText: true },
    take: 5
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl relative z-10">
        <OnboardingFlow 
          categories={uniqueCategories} 
          suggestedCreators={creators}
          userId={user.id}
        />
      </div>
    </div>
  )
}
