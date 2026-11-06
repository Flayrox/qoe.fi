import { getPostThreadAction } from '@qoe/sdk/actions/feed';
import { notFound, redirect } from 'next/navigation';
import { routes } from '@qoe/config/routes';

interface ThoughtCatchAllProps {
  params: Promise<{
    slug: string[];
  }>;
}

export default async function ThoughtCatchAllPage({ params }: ThoughtCatchAllProps) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    redirect(routes.feed.home());
  }

  // Cas 1 : /thought/:id (ex: /thought/wdbuwdw ou lien de notification /thought/abc)
  if (slug.length === 1) {
    const postId = decodeURIComponent(slug[0]);
    const res = await getPostThreadAction(postId);
    const post = res.ok ? res.data?.post : null;

    if (!post) {
      notFound();
      return;
    }

    const isPureRepost = post.repost && (!post.content || !post.content.trim());
    const targetPost = isPureRepost ? post.repost! : post;
    const authorHandle =
      targetPost.author?.username ||
      targetPost.author?.subdomain ||
      targetPost.author?.id ||
      'author';

    redirect(routes.feed.thought(authorHandle, targetPost.id));
  }

  // Cas 2 : /thought/:username/:id (ex: /thought/alex/wdbuwdw issu d'anciens partages)
  if (slug.length === 2) {
    const username = decodeURIComponent(slug[0]).replace(/^@/, '');
    const postId = decodeURIComponent(slug[1]);
    redirect(routes.feed.thought(username, postId));
  }

  notFound();
}
