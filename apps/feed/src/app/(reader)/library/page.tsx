import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { LibraryClient } from "./LibraryClient"

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const bookmarks = await prisma.bookmark.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        include: {
          author: { select: { name: true, username: true, subdomain: true, customDomain: true, logoUrl: true } },
          category: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Serialize Date objects for React Client component compatibility
  const serializedBookmarks = bookmarks.map((b: any) => ({
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    article: {
      ...b.article,
      createdAt: b.article.createdAt.toISOString(),
      updatedAt: b.article.updatedAt.toISOString(),
    }
  }))

  return <LibraryClient bookmarks={serializedBookmarks} />
}
