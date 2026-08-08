import { createClient } from "@qoe/supabase/server"
import { posts } from "@qoe/db"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"
import { ExpandedPostView } from "@/app/(reader)/home/components/ExpandedPostView"

interface ThoughtPageProps {
  params: Promise<{
    username: string
    id: string
  }>
}

export async function generateMetadata({ params }: ThoughtPageProps): Metadata {
  const resolvedParams = await params
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, "")
  const postId = resolvedParams.id

  const post = await posts.findThreadById(postId)
  if (!post) {
    return {
      title: "Pensée introuvable — qoe.fi",
    }
  }

  const authorName = post.author.name || `@${rawUsername}`
  const shortContent = post.content.length > 80 ? `${post.content.slice(0, 80)}...` : post.content

  return {
    title: `${authorName} sur qoe.fi : "${shortContent}"`,
    description: post.content,
    openGraph: {
      title: `${authorName} sur qoe.fi`,
      description: post.content,
      images: post.imageUrl ? [{ url: post.imageUrl }] : undefined,
    },
    twitter: {
      card: post.imageUrl ? "summary_large_image" : "summary",
      title: `${authorName} sur qoe.fi`,
      description: post.content,
      images: post.imageUrl ? [post.imageUrl] : undefined,
    },
  }
}

export default async function ThoughtPage({ params }: ThoughtPageProps) {
  const resolvedParams = await params
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, "")
  const postId = resolvedParams.id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const post = await posts.findThreadById(postId)
  if (!post) {
    notFound()
  }

  return (
    <ReaderPageLayout giantTitle="Pensée">
      <main className="mt-64 sm:mt-72 bg-card/95 backdrop-blur-2xl text-card-foreground rounded-t-2xl border-t border-x border-border/40 shadow-2xl min-h-screen relative z-10 transition-all">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <ExpandedPostView
            postId={postId}
            currentUserId={user?.id || null}
            initialPost={post}
            standalone={true}
          />
        </div>
      </main>
    </ReaderPageLayout>
  )
}
