import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { LibraryClient } from './LibraryClient';

// ── Contrat GET /v1/bookmarks (bibliothèque, Go) ─────────────────────────
interface BookmarkItem {
  bookmarkId: string;
  bookmarkedAt: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  readingTime: number;
  isPremium: boolean;
  articleCreatedAt: string;
  content: string;
  publicationId: string;
  publicationName: string;
  publicationSlug: string;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  categoryName: string | null;
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Go en primaire (auth requise) — fallback Prisma en dev.
  try {
    const items = await goFetch<BookmarkItem[]>('/v1/bookmarks?limit=100');
    const serializedBookmarks = items.map((b) => ({
      id: b.bookmarkId,
      createdAt: b.bookmarkedAt,
      article: {
        id: b.articleId,
        slug: b.articleSlug,
        title: b.articleTitle,
        content: b.content,
        readingTime: b.readingTime,
        author: {
          name: b.publicationName,
          username: b.publicationSlug,
          subdomain: b.subdomain,
          customDomain: b.customDomain,
          logoUrl: b.logoUrl,
        },
        category: b.categoryName ? { name: b.categoryName } : null,
      },
    }));
    return <LibraryClient bookmarks={serializedBookmarks} />;
  } catch {
    // Fallback Prisma (dev sans QOE_API_URL).
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
}
