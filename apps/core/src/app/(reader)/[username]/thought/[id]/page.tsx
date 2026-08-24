import { createClient } from '@qoe/supabase/server';
import { getPostThreadAction } from '@qoe/sdk/actions/feed';
import { getRequestDbUser } from '@/lib/cached-queries';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import { ThoughtThreadView } from '@/app/(reader)/home/components/ThoughtThreadView';
import { routes } from '@qoe/config/routes';
import type { OptimisticThought } from '@/app/(reader)/home/components/thread';

interface ThoughtPageProps {
  params: Promise<{
    username: string;
    id: string;
  }>;
}

export async function generateMetadata({ params }: ThoughtPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const postId = resolvedParams.id;

  const res = await getPostThreadAction(postId);
  const post = res.ok ? res.data?.post : null;
  if (!post) {
    return {
      title: 'Pensée introuvable — qoe.fi',
    };
  }

  // If this post is a pure repost pointer (no commentary), use the original post for metadata
  const isPureRepost = post.repost && (!post.content || !post.content.trim());
  const targetPost = isPureRepost ? post.repost! : post;
  const authorName =
    targetPost.author.name || `@${targetPost.author.username || targetPost.author.id}`;
  const shortContent =
    targetPost.content.length > 80 ? `${targetPost.content.slice(0, 80)}...` : targetPost.content;

  return {
    title: `${authorName} sur qoe.fi : "${shortContent}"`,
    description: targetPost.content,
    openGraph: {
      title: `${authorName} sur qoe.fi`,
      description: targetPost.content,
      images: targetPost.imageUrl ? [{ url: targetPost.imageUrl }] : undefined,
    },
    twitter: {
      card: targetPost.imageUrl ? 'summary_large_image' : 'summary',
      title: `${authorName} sur qoe.fi`,
      description: targetPost.content,
      images: targetPost.imageUrl ? [targetPost.imageUrl] : undefined,
    },
  };
}

export default async function ThoughtPage({ params }: ThoughtPageProps) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const postId = resolvedParams.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [threadRes, dbUser] = await Promise.all([
    getPostThreadAction(postId),
    user ? getRequestDbUser(user.id) : null,
  ]);

  const post = threadRes.ok ? threadRes.data?.post : null;

  if (!post) {
    notFound();
  }

  // 1. If this is a pure repost record (no commentary), redirect to the original post's canonical URL
  if (post.repost && (!post.content || !post.content.trim())) {
    const originalAuthorHandle = post.repost.author.username || post.repost.author.id;
    redirect(routes.feed.thought(originalAuthorHandle, post.repost.id));
  }

  // 2. If the URL username does not match the actual post author, redirect to canonical URL
  const canonicalAuthorHandle = post.author.username || post.author.id;
  if (rawUsername.toLowerCase() !== canonicalAuthorHandle.toLowerCase()) {
    redirect(routes.feed.thought(canonicalAuthorHandle, post.id));
  }

  return (
    <ReaderPageLayout giantTitle="Pensée">
      <main className="mt-64 sm:mt-72 bg-card/95 backdrop-blur-2xl text-card-foreground rounded-t-2xl border-t border-x border-border/40 shadow-2xl min-h-screen relative z-10 transition-all">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <ThoughtThreadView
            postId={postId}
            currentUserId={user?.id || null}
            dbUser={dbUser}
            initialPost={post as unknown as OptimisticThought}
            standalone={true}
          />
        </div>
      </main>
    </ReaderPageLayout>
  );
}
