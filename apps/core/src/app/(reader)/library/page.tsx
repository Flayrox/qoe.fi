import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { LibraryClient } from './LibraryClient';
import { resolveLibraryTab } from './library-helpers';

// ── Contrats API Go (bibliothèque) ──────────────────────────────────
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

interface MyHighlightItem {
  id: string;
  text: string;
  note: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  readerId: string;
  articleId: string;
  createdAt: string;
  articleTitle: string;
  articleSlug: string;
  publicationId: string;
  publicationName: string;
  publicationSlug: string;
  publicationSubdomain: string | null;
  publicationCustomDomain: string | null;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolveLibraryTab(resolvedSearchParams?.tab);

  // Récupération conjointe en parallèle des signets et surlignages (Go backend-of-record)
  const [rawBookmarks, rawHighlights] = await Promise.all([
    goFetch<BookmarkItem[]>('/v1/bookmarks?limit=100').catch(() => [] as BookmarkItem[]),
    goFetch<MyHighlightItem[]>('/v1/me/highlights?limit=100').catch(() => [] as MyHighlightItem[]),
  ]);

  const serializedBookmarks = (rawBookmarks || []).map((b) => ({
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
        type: 'MEDIA' as const,
      },
      category: b.categoryName ? { name: b.categoryName } : null,
    },
  }));

  const serializedHighlights = (rawHighlights || []).map((h) => ({
    id: h.id,
    text: h.text,
    note: h.note,
    createdAt: h.createdAt,
    isPublic: h.isPublic,
    article: {
      id: h.articleId,
      title: h.articleTitle,
      slug: h.articleSlug,
      publication: {
        id: h.publicationId,
        name: h.publicationName,
        slug: h.publicationSlug,
        subdomain: h.publicationSubdomain,
        customDomain: h.publicationCustomDomain,
        type: 'MEDIA' as const,
      },
    },
  }));

  return (
    <LibraryClient
      bookmarks={serializedBookmarks}
      highlights={serializedHighlights}
      initialTab={initialTab}
    />
  );
}
