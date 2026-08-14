import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { LibraryClient } from './LibraryClient';

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const bookmarks = await prisma.bookmark.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        include: {
          publication: {
            select: {
              name: true,
              slug: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              type: true,
            },
          },
          author: { select: { id: true, name: true } },
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Serialize Date objects for React Client component compatibility
  const serializedBookmarks = bookmarks.map((b) => ({
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    article: {
      ...b.article,
      createdAt: b.article.createdAt.toISOString(),
      updatedAt: b.article.updatedAt.toISOString(),
      author: {
        name: b.article.publication?.name ?? null,
        username: b.article.publication?.slug ?? null,
        subdomain: b.article.publication?.subdomain ?? null,
        customDomain: b.article.publication?.customDomain ?? null,
        logoUrl: b.article.publication?.logoUrl ?? null,
      },
    },
  }));

  return <LibraryClient bookmarks={serializedBookmarks} />;
}
