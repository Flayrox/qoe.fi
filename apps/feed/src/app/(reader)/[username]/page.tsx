import { createClient } from "@qoe/supabase/server"
import { notFound } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { ProfileView } from "./components/ProfileView"

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = await params
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '')
  
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: rawUsername, mode: 'insensitive' } },
        { subdomain: { equals: rawUsername, mode: 'insensitive' } }
      ]
    },
    select: { name: true, username: true, heroText: true, logoUrl: true }
  })

  if (!user) {
    return { title: "Profil introuvable — qoe.fi" }
  }

  return {
    title: `${user.name || `@${user.username}`} (@${user.username}) — qoe.fi`,
    description: user.heroText || `Profil créateur de ${user.name} sur qoe.fi.`,
    openGraph: {
      title: `${user.name || `@${user.username}`} sur qoe.fi`,
      description: user.heroText || `Suivez ${user.name} sur qoe.fi.`,
      images: user.logoUrl ? [{ url: user.logoUrl }] : []
    }
  }
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = await params
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '')

  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  // Find profile user
  const profileUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: rawUsername, mode: 'insensitive' } },
        { subdomain: { equals: rawUsername, mode: 'insensitive' } }
      ]
    },
    include: {
      posts: {
        where: { isDraft: false },
        include: {
          author: { select: { id: true, name: true, username: true, subdomain: true, logoUrl: true, isCertified: true } },
          parent: { select: { id: true, author: { select: { id: true, name: true, username: true, subdomain: true } } } },
          likes: { select: { userId: true } },
          repost: {
            include: {
              author: { select: { id: true, name: true, username: true, subdomain: true, logoUrl: true } }
            }
          },
          _count: { select: { likes: true, replies: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      },
      articles: {
        where: { published: true },
        include: {
          author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
          category: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 30
      },
      followers: { select: { readerId: true } },
      following: { select: { creatorId: true } },
      _count: {
        select: {
          followers: true,
          following: true,
          posts: true,
          articles: true
        }
      }
    }
  })

  if (!profileUser) {
    notFound()
  }

  const isOwnProfile = currentUser?.id === profileUser.id
  const isFollowing = currentUser ? profileUser.followers.some(f => f.readerId === currentUser.id) : false

  return (
    <ProfileView
      profileUser={profileUser}
      currentUserId={currentUser?.id || null}
      isOwnProfile={isOwnProfile}
      initialIsFollowing={isFollowing}
    />
  )
}
