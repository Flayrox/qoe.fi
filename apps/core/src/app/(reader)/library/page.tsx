import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
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

  // Go (backend-of-record, requis en Phase 3) : GET /v1/bookmarks.
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
}
